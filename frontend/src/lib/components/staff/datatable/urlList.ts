import { goto } from '$app/navigation';
import { page } from '$app/state';

/**
 * Navigation for a list whose filters, sort and page live in the querystring.
 * Five pages had written `navigateWithParams` out for themselves and three had
 * written `goToPage`, with the differences between the copies unexplained: two
 * reset `?page` and three did not, two suppressed the scroll and three did not.
 *
 * The rule the copies were reaching for, applied here uniformly:
 *
 * - **A filter change resets to page 1.** Keeping the page would strand the
 *   reader on an out-of-range page of a narrower list. Where a list has no
 *   paging the delete is simply a no-op, so this needs no opt-out.
 * - **A filter change does not scroll; a page change does.** Re-filtering in
 *   place should leave you where you were looking, while stepping to page 2
 *   should show you its top.
 * - **Focus is always kept**, so the search box survives its own navigation.
 */

/** Set (or, for an empty value, drop) querystring params, back to page 1. */
export function setListParams(params: Record<string, string>): void {
  const url = new URL(page.url);
  url.searchParams.delete('page');
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  void goto(url.toString(), { keepFocus: true, noScroll: true });
}

/** Move to a page, dropping the param entirely for page 1 so URLs stay clean. */
export function goToListPage(target: number): void {
  const url = new URL(page.url);
  if (target > 1) url.searchParams.set('page', String(target));
  else url.searchParams.delete('page');
  void goto(url.toString(), { keepFocus: true });
}

/** Drop every filter: navigate to the bare pathname. */
export function resetListParams(): void {
  void goto(page.url.pathname, { keepFocus: true, noScroll: true });
}
