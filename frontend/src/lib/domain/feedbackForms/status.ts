// Single source for how a feedback form's lifecycle status is presented (French
// label + badge colour + menu order). Both the admin list and the builder's
// settings panel read from here, so the three states never drift apart.

export const FORM_STATUS_LABELS = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
} as const;

export type FormStatusValue = keyof typeof FORM_STATUS_LABELS;

// Lifecycle order shown in selects (draft -> published -> archived).
export const FORM_STATUS_OPTIONS: { value: FormStatusValue; label: string }[] =
  (['draft', 'published', 'archived'] as const).map((value) => ({
    value,
    label: FORM_STATUS_LABELS[value],
  }));

// Pill background/text per status (admin list status pill).
export const FORM_STATUS_BADGE_CLASS: Record<FormStatusValue, string> = {
  draft: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  published:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  archived: 'bg-slate-100 text-slate-500 dark:bg-slate-800',
};
