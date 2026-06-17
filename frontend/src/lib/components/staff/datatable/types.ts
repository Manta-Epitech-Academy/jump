export type SortDir = 'asc' | 'desc';

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
};
