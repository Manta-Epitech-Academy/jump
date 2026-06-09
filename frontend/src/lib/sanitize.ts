import DOMPurify from 'isomorphic-dompurify';

/**
 * DOMPurify drops `target` from anchors by default and never adds a safe `rel`.
 * Staff-authored activity content links out to external subjects and resources,
 * so those links must open in a new tab without handing the opener over to the
 * destination (reverse-tabnabbing). This hook re-applies `target` + a hardened
 * `rel` to absolute http(s) links only, leaving in-page (`#…`), relative and
 * `mailto:` links to behave normally.
 */
function externalizeLinks(node: Element): void {
  if (node.nodeName !== 'A') return;
  const href = node.getAttribute('href') ?? '';
  if (/^https?:\/\//i.test(href)) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
}

/**
 * Sanitize staff-authored activity HTML (the static `Activity.content`) for
 * rendering, forcing external links to open safely in a new tab.
 *
 * The hook is added and removed around the single synchronous `sanitize` call,
 * so it never leaks into the shared DOMPurify singleton's other callers (this
 * mirrors the discipline in `$lib/server/cms/sanitize.ts`).
 */
export function sanitizeActivityContent(raw: string): string {
  DOMPurify.addHook('afterSanitizeAttributes', externalizeLinks);
  try {
    return DOMPurify.sanitize(raw);
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
