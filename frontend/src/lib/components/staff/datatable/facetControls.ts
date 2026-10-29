import type { ListFacet } from '$lib/domain/listFacets';
import type { ActiveFilterChip, ColumnFilter } from './types';

/**
 * The controls a list's facets put on screen: each column's header filter and
 * the row of chips above the table (`ActiveFilterChips`). Every filtered staff
 * list wrote these for itself, the same way; they are written once here so a
 * chip names a value and a header offers one identically on every list.
 *
 * Writing the change is the page's (`setFacet`), as the selection lives in its
 * address: the controls only read the facets and hand every change back.
 */
export type FacetControls<K extends string> = {
  /** Whether the list offers this facet at all (Inscrits hides Statut on a
   *  campus that does not onboard). */
  has: (facet: K) => boolean;
  /** The header filter of a facet, or none when the list does not offer it or
   *  when it has a single value to offer. */
  filterOf: (facet: K) => ColumnFilter | undefined;
  /** One chip per ticked value, in the facets' order, each removing itself. */
  chips: ActiveFilterChip[];
};

export function facetControls<K extends string>(
  facets: readonly ListFacet<K>[],
  setFacet: (facet: K, values: string[]) => void,
): FacetControls<K> {
  const byFacet = new Map(facets.map((f) => [f.facet, f]));
  return {
    has: (facet) => byFacet.has(facet),
    filterOf(facet) {
      const f = byFacet.get(facet);
      return f && f.options.length > 0
        ? {
            options: f.options,
            selected: f.selected,
            onChange: (values) => setFacet(facet, values),
          }
        : undefined;
    },
    chips: facets.flatMap((f) =>
      f.selected.map((value) => ({
        id: `${f.facet}:${value}`,
        facet: f.title,
        label: f.options.find((o) => o.value === value)?.label ?? value,
        onRemove: () =>
          setFacet(
            f.facet,
            f.selected.filter((v) => v !== value),
          ),
      })),
    ),
  };
}
