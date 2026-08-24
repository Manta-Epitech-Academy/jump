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
 * 3. render with the network blocked (`infra/pdfRenderer.ts`) - the one that
 *    actually contains the damage, and the reason a missed `url()` is inert.
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
 * Drop any inline `style` declaration that would fetch. DOMPurify keeps arbitrary
 * style declarations - it only neutralises `javascript:` and the like - so
 * `style="background: url(http://...)"` survives its default config untouched.
 * Same shape as the CMS hook in `server/cms/sanitize.ts`, and added and removed
 * around the one synchronous call for the same reason: DOMPurify is a shared
 * singleton, so a hook left in place would change sanitising for the CMS, the
 * broadcast renderer and `renderMarkdown`.
 */
function dropFetchingInlineStyle(
  _node: Element,
  data: { attrName: string; attrValue: string; keepAttr: boolean },
): void {
  if (data.attrName !== 'style') return;
  const safe = data.attrValue
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => !REMOTE_URL.test(d) && !CSS_EXPRESSION.test(d));
  if (safe.length === 0) data.keepAttr = false;
  else data.attrValue = safe.join('; ');
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
 * its own pass rather than a config flag. */
export function sanitizeCertificateCss(styleCss: string): string {
  return styleCss
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, 'none')
    .replace(/url\(\s*['"]?(?!data:)[^)]*\)/gi, 'none');
}
