// Single source for how a feedback form's lifecycle status is presented (French
// label + badge colour + filter order). The admin list, its filter and the form
// header read from here, so the three states never drift apart.

export const FORM_STATUS_LABELS = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
} as const;

export type FormStatusValue = keyof typeof FORM_STATUS_LABELS;

// Lifecycle order shown in the list's status filter (draft -> published -> archived).
export const FORM_STATUS_OPTIONS: { value: FormStatusValue; label: string }[] =
  (['draft', 'published', 'archived'] as const).map((value) => ({
    value,
    label: FORM_STATUS_LABELS[value],
  }));

// Badge background/text per status (admin list and form header).
export const FORM_STATUS_BADGE_CLASS: Record<FormStatusValue, string> = {
  draft: 'bg-warning/10 text-warning',
  published: 'bg-success/10 text-success',
  archived: 'bg-muted text-muted-foreground',
};
