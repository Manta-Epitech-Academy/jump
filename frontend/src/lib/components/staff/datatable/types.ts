export type SortDir = 'asc' | 'desc';

/** One value a column can be filtered on, with how many rows carry it. */
export type FacetOption = { value: string; label: string; count: number };

/**
 * A multi-value filter over a column, opened from the column's header. The
 * parent owns the selection, as it owns the sort: the table only renders the
 * control and hands every change back through `onChange`.
 */
export type ColumnFilter = {
  options: FacetOption[];
  selected: readonly string[];
  onChange: (values: string[]) => void;
};

/** One active filter value, as the row of chips above a list shows it
 *  (`ActiveFilterChips`). */
export type ActiveFilterChip = {
  /** Unique across the row, e.g. `lycee:<id>`. */
  id: string;
  /** What is filtered, "Lycée". */
  facet: string;
  /** The value kept, "Lycée Pasteur". */
  label: string;
  onRemove: () => void;
};

/** A filter with the name it is listed under, for the menus that gather
 *  several (the mobile drawer, a toolbar's "Filtres"). */
export type NamedFilter = { key: string; label: string; filter: ColumnFilter };

export type ColumnDef = {
  /** Stable sort key, passed back through `onSort`. */
  key: string;
  /** Header label (French, uppercased by the table chrome). */
  label: string;
  /** Whether the header is clickable to toggle sort on this column. */
  sortable?: boolean;
  /**
   * First-click sort direction when this column becomes the active one (further
   * clicks toggle from there). Defaults to `'asc'`. Set `'desc'` for columns
   * whose "most interesting" reading is high-to-low, e.g. an XP/score column
   * where the team wants the top values first, not a climb from zero.
   */
  defaultSortDir?: SortDir;
  /** Cell/header alignment. Defaults to left. */
  align?: 'left' | 'right';
  /** Extra classes merged onto the `<th>`. */
  class?: string;
  /**
   * Filter the column from its header. A sortable column keeps its label as
   * the sort button and gains a funnel beside it; a column that only filters
   * makes its whole label the funnel. On mobile, where there is no header, the
   * same filters open from a "Filtrer" control beside "Trier".
   */
  filter?: ColumnFilter;
};
