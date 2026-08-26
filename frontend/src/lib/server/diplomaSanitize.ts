import DOMPurify from 'isomorphic-dompurify';

/**
 * Guard rails for a certificate design authored at runtime.
 *
 * The design is stored in the database and rendered by a real Chrome inside the
 * cluster, from a pod that can reach the database and every internal service, so
 * `page.setContent` executes whatever is in it. There are three controls in front
 * of that, and this module is two of them:
 *
 * 1. refuse, so the author is TOLD what will not work (`certificateProblems`);
 * 2. sanitise, so nothing dangerous is stored even if the refusal missed it;
 * 3. render with script execution and the network off (`infra/documentRenderer.ts`)
 *    - the one that actually contains the damage, and the reason a missed `url()`
 *    or a missed tag is inert.
 *
 * The first two are not one mechanism twice: a refusal is for the person writing
 * the design, the sanitiser is for the bytes we keep.
 */

/** Anything that would fetch, in CSS or in an inline style attribute. */
const REMOTE_URL = /url\(\s*['"]?(?!data:)[^)'"]/i;
const AT_IMPORT = /@import/i;
const CSS_EXPRESSION = /expression\s*\(/i;
/** Tags that execute, navigate, or pull something in. */
const ACTIVE_TAG =
  /<\s*(script|style|iframe|object|embed|link|base|meta|form|svg|math)\b/i;
/** `onclick=`, `onerror=`, ... on any element. */
const EVENT_HANDLER = /<[^>]+\son[a-z]+\s*=/i;
/**
 * Any `<` in the stylesheet. Not a tag-name list, because the stylesheet is
 * emitted inside a `<style>` element and `</style>` is the only thing needed to
 * leave it: past that, the rest of the design is parsed as markup in the head.
 * One character covers every spelling of that, opening tag or closing.
 */
const CSS_MARKUP = /</;

/**
 * What is wrong with this design, in French, for the caller to act on. Empty
 * means it is safe to store.
 *
 * Each message names the construct and why it cannot work, because the author is
 * usually a language model relaying to a human: "refusé" with no reason produces
 * another attempt at the same thing.
 */
export function certificateProblems(design: {
  styleCss: string;
  bodyHtml: string;
}): string[] {
  const problems: string[] = [];
  const { styleCss, bodyHtml } = design;

  if (ACTIVE_TAG.test(bodyHtml)) {
    problems.push(
      "Le corps du certificat ne peut pas contenir de balise script, style, iframe, object, embed, link, base, meta, form ou svg. Le CSS va dans le champ dédié (« styleCss »), qui est inséré une seule fois dans l'en-tête du document au lieu d'être répété à chaque page.",
    );
  }
  if (EVENT_HANDLER.test(bodyHtml)) {
    problems.push(
      "Le corps du certificat ne peut pas porter d'attribut d'événement (onclick, onerror, ...) : le document est imprimé, rien n'y est cliquable.",
    );
  }
  if (CSS_MARKUP.test(styleCss)) {
    problems.push(
      '« styleCss » contient le caractère « < », qui ne veut rien dire en CSS et qui fermerait la balise <style> du document : tout ce qui suit se retrouverait dans la page au lieu de la feuille de style. Pour un chevron littéral, échappez-le (\\3C). Les dimensions de la page se règlent avec pageWidthPx et pageHeightPx, jamais avec une requête de média.',
    );
  }
  for (const [field, value] of [
    ['styleCss', styleCss],
    ['bodyHtml', bodyHtml],
  ] as const) {
    if (REMOTE_URL.test(value)) {
      problems.push(
        `« ${field} » référence une ressource distante avec url(...). Le document est rendu sans accès réseau : rien d'extérieur ne peut être chargé. Utilisez une image en data: URI, ou la variable --epitech-logo pour le logo.`,
      );
    }
    if (AT_IMPORT.test(value)) {
      problems.push(
        `« ${field} » utilise @import, qui ne peut pas aboutir : le document est rendu sans accès réseau. Les polices de la charte sont déjà disponibles (Anton, IBM Plex Sans).`,
      );
    }
    if (CSS_EXPRESSION.test(value)) {
      problems.push(`« ${field} » utilise expression(), qui n'est pas permis.`);
    }
  }
  return problems;
}

/**
 * Drop an inline `style` attribute that would fetch. DOMPurify keeps arbitrary
 * style declarations - it only neutralises `javascript:` and the like - so
 * `style="background: url(http://...)"` survives its default config untouched.
 * Same shape as the CMS hook in `server/cms/sanitize.ts`, and added and removed
 * around the one synchronous call for the same reason: DOMPurify is a shared
 * singleton, so a hook left in place would change sanitising for the CMS, the
 * broadcast renderer and `renderMarkdown`.
 *
 * The whole attribute, not the offending declaration: splitting a style attribute
 * into declarations needs a CSS parser, and splitting on `;` is not one. A data
 * URI carries a `;` of its own (`data:image/png;base64,...`), so the obvious
 * version corrupted exactly the thing the authoring contract tells people to use -
 * it rejoined the halves with a space and Chrome computed `background-image: none`.
 * Nothing is lost by dropping more: a value that reaches here at all was already
 * refused by `certificateProblems`, so this only runs when the refusal missed it.
 */
function dropFetchingInlineStyle(
  _node: Element,
  data: { attrName: string; attrValue: string; keepAttr: boolean },
): void {
  if (data.attrName !== 'style') return;
  if (REMOTE_URL.test(data.attrValue) || CSS_EXPRESSION.test(data.attrValue)) {
    data.keepAttr = false;
  }
}

/**
 * The markup as it will be stored. `ALLOWED_URI_REGEXP` restricted to `data:` is
 * the single most valuable rule here: it removes every remote `href` and `src` in
 * one stroke rather than tag by tag.
 */
export function sanitizeCertificateHtml(bodyHtml: string): string {
  DOMPurify.addHook('uponSanitizeAttribute', dropFetchingInlineStyle);
  try {
    return DOMPurify.sanitize(bodyHtml, {
      ALLOWED_URI_REGEXP: /^data:/i,
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
      ADD_ATTR: ['style'],
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
}

/** The stylesheet as it will be stored. DOMPurify does not parse CSS, so this is
 * its own pass rather than a config flag. `<` goes first: while one is left, the
 * rest of this function is guarding a string the browser may never read as CSS. */
export function sanitizeCertificateCss(styleCss: string): string {
  return styleCss
    .replace(/</g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, 'none')
    .replace(/url\(\s*['"]?(?!data:)[^)]*\)/gi, 'none');
}
