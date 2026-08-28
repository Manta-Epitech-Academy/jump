/**
 * Client-side paging for a list already held in memory. Used where the whole
 * list is loaded at once and paging is only there to keep the DOM small
 * (`/staff/admin/sf-conflicts` pages three such lists, `/staff/admin/users`
 * two), never where the server decides the page - there the page number rides
 * the URL and the query does the slicing.
 */

/** Number of pages, and 0 for an empty list so `Pagination` renders nothing. */
export function pageCount(total: number, perPage: number): number {
  return Math.ceil(total / perPage);
}

/**
 * The rows of one page. Clamps the page into range rather than returning an
 * empty slice: a filter that shrinks a list below the page you were on should
 * show you rows, not a blank table with working arrows.
 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  perPage: number,
): T[] {
  const last = Math.max(1, pageCount(items.length, perPage));
  const current = Math.min(Math.max(1, Math.trunc(page)), last);
  return items.slice((current - 1) * perPage, current * perPage) as T[];
}
