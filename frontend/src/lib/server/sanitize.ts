import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize rich HTML content before persisting to the database.
 * Strips dangerous tags/attributes (script, onerror, javascript: URIs, etc.)
 * while preserving safe formatting from the WYSIWYG editor.
 */
export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html);
}
