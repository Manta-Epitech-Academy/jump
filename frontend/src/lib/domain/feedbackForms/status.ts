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
  draft: 'bg-warning/10 text-warning',
  published: 'bg-success/10 text-success',
  archived: 'bg-muted text-muted-foreground',
};
