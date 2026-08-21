/**
 * The onboarding flow's field skin, in one place.
 *
 * Three steps each carried their own copy of these two strings, which is how
 * they all ended up suppressing the focus outline with nothing in its place:
 * the fix had to be made three times to land, so it was made none.
 *
 * They are soft-space values by construction, not by literal: `rounded-lg`
 * resolves through `--radius` and `shadow-raised` through `--elevation-raised`,
 * both of which the talent skin sets (see the space-skins block in
 * `routes/layout.css`).
 */
export const fieldInput =
  'rounded-lg border-border bg-card text-foreground placeholder:text-muted-foreground';

/** Chrome for a field's popover (a country selector, a school search). */
export const fieldPopover =
  'rounded-xl border border-border bg-card shadow-raised';
