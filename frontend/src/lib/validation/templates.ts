const activityTypes = [
  'atelier',
  'conference',
  'quiz',
  'orga',
  'special',
  'break',
] as const;

export const activityTypeLabels: Record<
  (typeof activityTypes)[number],
  string
> = {
  atelier: 'Atelier',
  conference: 'Conférence',
  quiz: 'Quiz',
  orga: 'Organisation',
  special: 'Spécial',
  break: 'Pause',
};

/**
 * Centralised color tokens per activity type — used to style activity cards,
 * badges, and the calendar planner. Keep in sync with `activityTypes`.
 */
export const activityTypeStyles: Record<
  (typeof activityTypes)[number],
  { bg: string; border: string; text: string; accent: string }
> = {
  atelier: {
    bg: 'bg-success/10',
    border: 'border-l-teal-500',
    text: 'text-success',
    accent: 'text-success',
  },
  conference: {
    bg: 'bg-primary/10',
    border: 'border-l-indigo-500',
    text: 'text-primary',
    accent: 'text-primary',
  },
  quiz: {
    bg: 'bg-epi-tomorrow-ink/10',
    border: 'border-l-violet-500',
    text: 'text-epi-tomorrow-ink',
    accent: 'text-epi-tomorrow-ink',
  },
  orga: {
    bg: 'bg-muted',
    border: 'border-l-slate-500',
    text: 'text-foreground',
    accent: 'text-foreground-secondary',
  },
  special: {
    bg: 'bg-warning/10',
    border: 'border-l-amber-500',
    text: 'text-warning',
    accent: 'text-warning',
  },
  break: {
    bg: 'bg-muted',
    border: 'border-l-neutral-400',
    text: 'text-foreground',
    accent: 'text-foreground-secondary',
  },
};
