import createDOMPurify, {
  type RemovedAttribute,
  type RemovedElement,
} from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Guard rails for a certificate design authored at runtime.
 *
 * The design is stored in the database and rendered by a real Chrome inside the
 * cluster, from a pod that can reach the database and every internal service, so
 * `page.setContent` executes whatever is in it. There are two controls in front
 * of that, and this module is the first:
 *
 * 1. screen, so the author is TOLD what will not work and nothing dangerous is
 *    stored (`sanitizeCertificateDesign`);
 * 2. render with script execution and the network off (`infra/documentRenderer.ts`)
 *    - the one that actually contains the damage, and the reason a missed `url()`
 *    or a missed tag is inert.
 *
 * **The refusal is what the sanitiser removed, never a second opinion about it.**
 * They used to be two policies: regexes decided what to refuse and DOMPurify
 * decided what to keep, and they disagreed. `<svg>` was refused by one and kept by
 * the other, and the sanitiser's URI rule silently stripped `colspan`, `width` and
 * `lang` that nothing had refused, so a design could be stored as something its
 * author never wrote. Now the markup goes through DOMPurify once, and whatever it
 * had to take out is the refusal. A design is therefore stored exactly as written
 * (modulo serialisation), or not at all.
 *
 * The stylesheet has no parser here, so it keeps a pass of its own. There the
 * checks ARE the policy: a stylesheet that passes them holds nothing a CSS
 * sanitiser would have changed, so it is stored as written.
 */

/**
 * Anything that would fetch, in CSS or in an attribute. A `data:` URI is bytes we
 * already hold, and `url(#id)` points inside the document: neither fetches.
 */
const REMOTE_URL = /url\(\s*['"]?(?!data:|#)[^)'"]/i;
const AT_IMPORT = /@import/i;
const CSS_EXPRESSION = /expression\s*\(/i;
/**
 * Any `<` in the stylesheet. Not a tag-name list, because the stylesheet is
 * emitted inside a `<style>` element and `</style>` is the only thing needed to
 * leave it: past that, the rest of the design is parsed as markup in the head.
 * One character covers every spelling of that, opening tag or closing.
 */
const CSS_MARKUP = /</;

/**
 * What an address-carrying attribute may hold: a `data:` URI, or anything that is
 * not a scheme and not a protocol-relative path. This is DOMPurify's own default
 * shape with every scheme but `data:` taken out.
 *
 * It must not be narrower than that, and the reason is a DOMPurify detail worth
 * knowing: the rule is applied to the value of EVERY attribute outside a short
 * URI-safe list, not only to `href` and `src`. The previous rule, `^data:` alone,
 * therefore dropped `colspan="2"`, `width="50%"` and `lang="en"` as if they were
 * links, without a word.
 */
const LOCAL_URI = /^(?:data:|(?![/\\])[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * One DOMPurify bound to its own window, rather than the shared
 * `isomorphic-dompurify` singleton that the CMS, the broadcast renderer and
 * `renderMarkdown` use. A hook installed on the singleton changes sanitising for
 * all of them, which is why this module used to add and remove its hook around
 * each call. Owning the instance makes the hook permanent and local.
 */
const purifier = createDOMPurify(new JSDOM('').window);

/**
 * Drop an attribute whose value would fetch. DOMPurify keeps arbitrary style
 * declarations - it only neutralises `javascript:` and the like - so
 * `style="background: url(http://...)"` survives its config untouched.
 *
 * The whole attribute, not the offending declaration: splitting a style attribute
 * into declarations needs a CSS parser, and splitting on `;` is not one. A data
 * URI carries a `;` of its own (`data:image/png;base64,...`), so the obvious
 * version corrupted exactly the thing the authoring contract tells people to use.
 * Dropping it is also what makes it reach `removed`, and therefore the refusal.
 */
purifier.addHook('uponSanitizeAttribute', (_node, data) => {
  if (REMOTE_URL.test(data.attrValue) || CSS_EXPRESSION.test(data.attrValue)) {
    data.keepAttr = false;
  }
});

const BODY_CONFIG = {
  USE_PROFILES: { html: true },
  ALLOWED_URI_REGEXP: LOCAL_URI,
  // Without it a leading `<script>` or `<style>` is parsed into the head, which
  // DOMPurify discards without listing it in `removed`: the tag would vanish
  // from the stored design and never reach the refusal.
  FORCE_BODY: true,
  // Most of these are outside the HTML profile already. They are named anyway,
  // because this list is the statement of intent a reader looks for.
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'link',
    'base',
    'meta',
    'form',
  ],
};

/**
 * What DOMPurify reports removing that is not the author's: the marker element
 * `FORCE_BODY` inserts and takes out again, and comments, which carry nothing a
 * printed page shows.
 */
function isAuthored(entry: RemovedElement | RemovedAttribute): boolean {
  if (!('element' in entry)) return true;
  const name = entry.element.nodeName.toLowerCase();
  return name !== 'remove' && name !== '#comment';
}

/** `<tag>` for a removed element, `name (sur <tag>)` for a removed attribute. */
function describeRemoved(entries: (RemovedElement | RemovedAttribute)[]): {
  tags: string[];
  attributes: string[];
} {
  const tags = new Set<string>();
  const attributes = new Set<string>();
  for (const entry of entries.filter(isAuthored)) {
    if ('element' in entry) {
      tags.add(`<${entry.element.nodeName.toLowerCase()}>`);
    } else if (entry.attribute) {
      const on = entry.from.nodeName.toLowerCase();
      attributes.add(`${entry.attribute.name} (sur <${on}>)`);
    }
  }
  return { tags: [...tags], attributes: [...attributes] };
}

/**
 * The markup as it will be stored, and what had to be taken out of it to get
 * there. Synchronous on purpose: `removed` describes the last call only, so it is
 * read before anything else can sanitise.
 */
function sanitizeBody(bodyHtml: string): { html: string; problems: string[] } {
  const html = purifier.sanitize(bodyHtml, BODY_CONFIG);
  const { tags, attributes } = describeRemoved(purifier.removed);

  // Each message names the construct and why it cannot work, because the author
  // is usually a language model relaying to a human: "refusé" with no reason
  // produces another attempt at the same thing.
  const problems: string[] = [];
  if (tags.length > 0) {
    problems.push(
      `Le corps du certificat contient des balises qui ne peuvent pas y figurer : ${tags.join(', ')}. Le document est imprimé tel quel : rien n'y est exécuté, chargé ni saisi. Le CSS va dans le champ « styleCss », inséré une seule fois dans l'en-tête du document au lieu d'être répété à chaque page.`,
    );
  }
  if (attributes.length > 0) {
    problems.push(
      `Le corps du certificat contient des attributs qui ne peuvent pas y figurer : ${attributes.join(', ')}. Un document imprimé ne réagit à aucun événement, et une adresse ou un url(...) ne peut désigner qu'une donnée intégrée (data:) ou un repère de la page (#...) : le document est rendu sans accès réseau.`,
    );
  }
  return { html, problems };
}

/** The stylesheet's own checks. Empty means it is stored as written. */
function stylesheetProblems(styleCss: string): string[] {
  const problems: string[] = [];
  if (CSS_MARKUP.test(styleCss)) {
    problems.push(
      '« styleCss » contient le caractère « < », qui ne veut rien dire en CSS et qui fermerait la balise <style> du document : tout ce qui suit se retrouverait dans la page au lieu de la feuille de style. Pour un chevron littéral, échappez-le (\\3C). Les dimensions de la page se règlent avec pageWidthPx et pageHeightPx, jamais avec une requête de média.',
    );
  }
  if (REMOTE_URL.test(styleCss)) {
    problems.push(
      "« styleCss » référence une ressource distante avec url(...). Le document est rendu sans accès réseau : rien d'extérieur ne peut être chargé. Utilisez une image en data: URI, ou la variable --epitech-logo pour le logo.",
    );
  }
  if (AT_IMPORT.test(styleCss)) {
    problems.push(
      '« styleCss » utilise @import, qui ne peut pas aboutir : le document est rendu sans accès réseau. Les polices de la charte sont déjà disponibles (Anton, IBM Plex Sans).',
    );
  }
  if (CSS_EXPRESSION.test(styleCss)) {
    problems.push("« styleCss » utilise expression(), qui n'est pas permis.");
  }
  return problems;
}

/**
 * The design as it will be stored, and what is wrong with it, in French, for the
 * caller to act on. A non-empty `problems` means nothing may be stored.
 */
export function sanitizeCertificateDesign(input: {
  styleCss: string;
  bodyHtml: string;
}): {
  design: { styleCss: string; bodyHtml: string };
  problems: string[];
} {
  const body = sanitizeBody(input.bodyHtml);
  return {
    design: { styleCss: input.styleCss, bodyHtml: body.html },
    problems: [...body.problems, ...stylesheetProblems(input.styleCss)],
  };
}
