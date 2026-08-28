/**
 * The date-window half of an export menu: the period a download covers, the
 * counts inside it, and the hrefs built from it.
 *
 * Three menus had written all of this out - the onboarding PDFs, the closing
 * syntheses and the Salesforce divergences CSV - and the third says in its own
 * comment that it was "modelled on" the first. What they do NOT share is the
 * download control itself (two list rows against one full-width button) and
 * their copy, so those stay with each menu: the window is the duplication, the
 * button is not.
 */

export type ExportRange = { from: number | null; to: number | null };
export type ExportPeriod = '7d' | '30d' | 'all' | 'custom';

/** One thing that could be exported: when it became exportable, and its kind. */
export type ExportItem = { at: number; type?: string | null };

const DAY = 86_400_000;

const startOfDay = (ymd: string) => new Date(`${ymd}T00:00:00`).getTime();
const endOfDay = (ymd: string) => new Date(`${ymd}T23:59:59.999`).getTime();

export const EXPORT_PERIOD_OPTIONS = [
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: 'all', label: 'Tout' },
  { value: 'custom', label: 'Perso' },
];

/**
 * Build the download URL. `advance` marks a download that covers everything up
 * to now (the all-time export, or the "since" delta): the endpoint reads it to
 * move this admin's high-water mark once the archive is built, so the intent
 * rides the same request as the download with no second round-trip. A scoped or
 * historical window omits it.
 */
export function exportHref(
  base: string,
  range: ExportRange,
  options: { type?: string | null; advance?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (options.type) params.set('type', options.type);
  if (range.from !== null)
    params.set('from', new Date(range.from).toISOString());
  if (range.to !== null) params.set('to', new Date(range.to).toISOString());
  if (options.advance) params.set('advance', '1');
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Coarse age of the last export, for the line above the "since" download. */
export function sinceLabel(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "il y a moins d'une heure";
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

export function createExportWindow(items: () => ExportItem[]): {
  period: ExportPeriod;
  customFrom: string;
  customTo: string;
  readonly customInvalid: boolean;
  readonly selectedRange: ExportRange;
  countIn(range: ExportRange, type?: string | null): number;
  sinceRange(mark: string | null): ExportRange | null;
} {
  let period = $state<ExportPeriod>('all');
  let customFrom = $state('');
  let customTo = $state('');

  // One clock shared by every rolling window, re-read when the item list
  // changes, so the 7j and 30j boundaries (and the hrefs built from them) stay
  // consistent with each other instead of each sampling its own `Date.now()`.
  const now = $derived.by(() => {
    void items();
    return Date.now();
  });

  const customRange = $derived<ExportRange>({
    from: customFrom ? startOfDay(customFrom) : null,
    to: customTo ? endOfDay(customTo) : null,
  });

  // A custom window is unusable until both ends are set and ordered.
  const customInvalid = $derived(
    period === 'custom' &&
      (!customFrom ||
        !customTo ||
        (customRange.from !== null &&
          customRange.to !== null &&
          customRange.from > customRange.to)),
  );

  const selectedRange = $derived.by<ExportRange>(() => {
    if (period === 'custom') return customRange;
    if (period === '7d') return { from: now - 7 * DAY, to: null };
    if (period === '30d') return { from: now - 30 * DAY, to: null };
    return { from: null, to: null };
  });

  return {
    get period() {
      return period;
    },
    set period(next: ExportPeriod) {
      period = next;
    },
    get customFrom() {
      return customFrom;
    },
    set customFrom(next: string) {
      customFrom = next;
    },
    get customTo() {
      return customTo;
    },
    set customTo(next: string) {
      customTo = next;
    },
    get customInvalid() {
      return customInvalid;
    },
    get selectedRange() {
      return selectedRange;
    },
    countIn(range: ExportRange, type?: string | null) {
      return items().filter(
        (item) =>
          (!type || item.type === type) &&
          (range.from === null || item.at >= range.from) &&
          (range.to === null || item.at <= range.to),
      ).length;
    },
    sinceRange(mark: string | null) {
      return mark === null
        ? null
        : { from: new Date(mark).getTime(), to: null };
    },
  };
}
