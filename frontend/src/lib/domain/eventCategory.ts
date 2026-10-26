// ─── Event category (`EventConfig_Category`) ───────────────────────────────
//
// A kind of event ("Coding Club", "Stage", "Camp"), chosen in the event
// configuration, defaulted by the preset, and authored over the admin API.
//
// It is display only, and that is what separates it from the `eventType` retired
// in July 2026: the campus calendar colours and filters by it, a badge rule
// counts by it, and nothing else reads it. No screen, module, gate or figure
// changes with it; the modules stay the one switch of an event's pages. A rule
// that wants to branch on a category is asking for a module.

/**
 * A category's colour: any `#rrggbb` the team picks, stored lowercase. Authored
 * data rather than code, like a certificate design, so it sits outside the
 * `DESIGN.md` palette on purpose: the calendar needs one colour per kind of
 * event, and four brand accents were spent on the mockup's first four kinds.
 * What keeps any colour legible is the screen's job, never a refusal: a swatch
 * carries a border, so a near-white one still shows on a white card, and text
 * painted on a category fill derives its colour from the fill.
 */
export const EVENT_CATEGORY_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * A category's key: the identity every operation names and every badge rule
 * will, so it never changes once created. The label is what gets renamed.
 */
export const EVENT_CATEGORY_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Ceiling on a label: a legend entry and a chip, not a sentence. */
export const EVENT_CATEGORY_LABEL_MAX = 40;

/** Ceiling on a key: it spells a label, so it gets the label's. */
export const EVENT_CATEGORY_KEY_MAX = EVENT_CATEGORY_LABEL_MAX;

/**
 * Why an archived category is refused as a new choice, in the one wording both
 * doors use: the config wizard and the admin API.
 */
export function archivedCategoryRefusal(label: string): string {
  return `La catégorie « ${label} » est archivée : elle n'est plus donnée à un événement. Désarchivez-la, ou choisissez-en une autre.`;
}

/** A category as every screen and answer shows it. */
export type EventCategoryView = {
  key: string;
  label: string;
  /** `#rrggbb`. */
  color: string;
  archived: boolean;
};
