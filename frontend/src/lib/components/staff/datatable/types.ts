export type SortDir = 'asc' | 'desc';

export type ColumnDef = {
  /** Stable sort key, passed back through `onSort`. */
  key: string;
  /** Header label (French, uppercased by the table chrome). */
  label: string;
  /** Whether the header is clickable to toggle sort on this column. */
  sortable?: boolean;
  /** Cell/header alignment. Defaults to left. */
  align?: 'left' | 'right';
  /** Extra classes merged onto the `<th>`. */
  class?: string;
};
