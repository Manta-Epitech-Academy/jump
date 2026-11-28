import type { RemovedAttribute, RemovedElement } from 'dompurify';

/**
 * What a DOMPurify pass took out, as an author can read it. Shared by the
 * screens that store authored markup exactly as written or not at all (a
 * certificate's design, a badge's drawing): for them, whatever the sanitiser
 * removed IS the refusal, so it has to be named, never silently dropped.
 */

/**
 * What DOMPurify reports removing that is not the author's: the marker element
 * `FORCE_BODY` inserts and takes out again, and comments, which carry nothing a
 * reader is shown.
 */
function isAuthored(entry: RemovedElement | RemovedAttribute): boolean {
  if (!('element' in entry)) return true;
  const name = entry.element.nodeName.toLowerCase();
  return name !== 'remove' && name !== '#comment';
}

/** `<tag>` for a removed element, `name (sur <tag>)` for a removed attribute. */
export function describeRemoved(
  entries: (RemovedElement | RemovedAttribute)[],
): {
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
