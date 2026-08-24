/**
 * Escape a value for interpolation into HTML we build by hand: the email brand
 * shell, the broadcast renderer, the weekly digest.
 *
 * One copy on purpose. The two it replaces had already drifted: the broadcast
 * renderer escaped `'` and the digest did not, so the same event title reached
 * a recipient differently depending on which mail carried it, and only one of
 * the two was safe to interpolate into a single-quoted attribute.
 *
 * Not for spreadsheet XML (`server/xlsx.ts`), which needs numeric XML entities
 * for control characters this does not touch.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
