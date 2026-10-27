/**
 * The state a staff row is in (a dossier, a closing, a session), drawn the way
 * `DESIGN.md` draws a badge: a square (`sm`) on the card's own fill, the state
 * carried by the text colour and a border of the same hue, in the per-row
 * `epi-chip` face. A pill is a tag (an interest, a filter in force), so a state
 * is not one.
 *
 * Three rosters drew their states as tinted pills of their own and kept them
 * alike by a comment saying so; the shape lives here once instead, and each
 * page only says which tone a state takes.
 */

/** What a state means for the person reading the row. */
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

// Literal class strings, so Tailwind sees every one of them.
const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'border-border text-muted-foreground',
  success: 'border-success/30 text-success',
  warning: 'border-warning/30 text-warning',
  danger: 'border-destructive/30 text-destructive',
};

export function statusBadgeClass(tone: StatusTone): string {
  return `inline-flex items-center gap-1 rounded-sm border bg-card px-1.5 py-0.5 epi-chip whitespace-nowrap ${TONE_CLASS[tone]}`;
}
