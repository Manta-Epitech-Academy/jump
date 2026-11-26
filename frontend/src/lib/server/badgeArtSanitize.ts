import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { BADGE_ART_FONTS, BADGE_ART_MAX } from '#lib/domain/badges.ts';
import { describeRemoved } from '#lib/server/sanitizeRemoved.ts';

/**
 * The guard on a badge's drawing (#551), written at runtime over `write_badge`
 * and drawn straight into a talent's page, often a minor's.
 *
 * A certificate's design is rendered by a Chrome with scripts and the network
 * off, so its screen only has to tell the author what will not print. A badge's
 * drawing has no such second wall: it is inserted into the live page Jump
 * serves, so this list IS the wall. That is why it is an allowlist and a short
 * one, the shapes and the text a sticker is drawn with, rather than the SVG
 * profile with the dangerous parts taken out. The page's CSP (`script-src`
 * without `'unsafe-inline'`) would still block an `on...` handler that got
 * through, and that is a backstop, not the reason this list may be loose.
 *
 * Left out on purpose, each for a reason an author can act on:
 * - `id`, and so `url(#...)`, `use`, gradients, clip paths, `defs`: thirty
 *   drawings share one page, and two that both say `id="g"` paint each other.
 *   The mockup's twenty-one stickers use none of them.
 * - `style`: what it can say, the presentation attributes say, and a style
 *   attribute is CSS to screen on top of markup.
 * - any address (`href`, `xlink:href`), `foreignObject`, `image`, animation:
 *   nothing a sticker needs, everything a payload does.
 *
 * Same contract as the certificate's: the drawing is stored exactly as written
 * (modulo serialisation), or not at all, and what the sanitiser would have
 * removed is the refusal.
 */

/** The elements a sticker is drawn with. `svg` is the frame this module wraps it in. */
const ART_TAGS = [
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'polygon',
  'polyline',
  'line',
  'text',
  'tspan',
];

/** Geometry, and the presentation attributes a drawing paints with. */
const ART_ATTRIBUTES = [
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'dx',
  'dy',
  'width',
  'height',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'paint-order',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
];

const FONTS: ReadonlySet<string> = new Set(BADGE_ART_FONTS);

/**
 * Its own DOMPurify, bound to its own window, so the hook below is this
 * module's alone (the reason `diplomaSanitize.ts` gives for owning one too).
 */
const purifier = createDOMPurify(new JSDOM('').window);

/**
 * A value that would reach outside the drawing, `url(...)`, or a face the page
 * does not load. Dropping the attribute is what makes it reach `removed`, and
 * so the refusal.
 */
purifier.addHook('uponSanitizeAttribute', (_node, data) => {
  if (/url\s*\(|expression\s*\(/i.test(data.attrValue)) data.keepAttr = false;
  if (data.attrName === 'font-family' && !FONTS.has(data.attrValue.trim())) {
    data.keepAttr = false;
  }
});

const CONFIG = {
  // `body` is the element DOMPurify parses into and returns the inside of. Not
  // listed, it is reported removed on every call; listed, an author's own
  // `<body>` merges into it and never reaches the output.
  ALLOWED_TAGS: [...ART_TAGS, 'body'],
  ALLOWED_ATTR: ART_ATTRIBUTES,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
};

/**
 * The drawing as it will be stored, and what is wrong with it, in French. A
 * non-empty `problems` means nothing may be stored. `art` is the inside of the
 * sticker only: the frame is `badgeStickerSvg` (`domain/badges.ts`).
 */
export function screenBadgeArt(input: string): {
  art: string;
  problems: string[];
} {
  if (input.length > BADGE_ART_MAX) {
    return {
      art: input,
      problems: [
        `Le dessin du badge fait ${input.length} caractères, pour ${BADGE_ART_MAX} au plus. Dessinez avec moins de formes : un autocollant se lit en 64 pixels, et un dessin aussi lourd est le plus souvent une image recopiée point par point.`,
      ],
    };
  }

  // Wrapped, so the parser reads the shapes as SVG: on their own, in an HTML
  // body, a `<circle>` is an unknown HTML element.
  const sanitized = purifier.sanitize(`<svg>${input}</svg>`, CONFIG);
  const { tags, attributes } = describeRemoved(purifier.removed);
  const body = JSDOM.fragment(sanitized);

  // Each message names the construct and why, because the author is usually a
  // model relaying to a human, and "refusé" alone produces the same attempt.
  const problems: string[] = [];
  if (tags.length > 0) {
    problems.push(
      `Le dessin du badge contient des balises qui ne peuvent pas y figurer : ${tags.join(', ')}. Un badge se dessine avec ${ART_TAGS.filter(
        (t) => t !== 'svg',
      )
        .map((t) => `<${t}>`)
        .join(
          ', ',
        )}, sans dégradé, image, lien ni animation, et sans balise <svg> : le cadre est déjà posé autour du dessin.`,
    );
  }
  if (attributes.length > 0) {
    problems.push(
      `Le dessin du badge contient des attributs qui ne peuvent pas y figurer : ${attributes.join(', ')}. Seuls la géométrie et les attributs de présentation (fill, stroke, font-size...) sont reconnus, sans id, style, adresse ni url(...), et font-family vaut ${BADGE_ART_FONTS.map((f) => `« ${f} »`).join(' ou ')}.`,
    );
  }

  const frame = body.firstElementChild;
  const outside = [...body.childNodes].some(
    (node) =>
      node !== frame &&
      !(node.nodeType === node.TEXT_NODE && !node.textContent?.trim()),
  );
  if (frame?.nodeName.toLowerCase() !== 'svg' || outside) {
    problems.push(
      'Le dessin du badge ferme son cadre : il ne doit pas contenir de balise </svg>. Donnez seulement ce qui se dessine à l’intérieur.',
    );
    return { art: input, problems };
  }
  if (frame.querySelector('svg')) {
    problems.push(
      'Le dessin du badge contient une balise <svg>. Le cadre est déjà posé autour du dessin : donnez seulement ce qui se dessine à l’intérieur.',
    );
  }
  if (frame.children.length === 0) {
    problems.push(
      'Le dessin du badge ne dessine rien : il lui faut au moins une forme.',
    );
  }
  return { art: frame.innerHTML, problems };
}
