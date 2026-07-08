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
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    border: 'border-l-teal-500',
    text: 'text-teal-900 dark:text-teal-100',
    accent: 'text-teal-700 dark:text-teal-300',
  },
  conference: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    border: 'border-l-indigo-500',
    text: 'text-indigo-900 dark:text-indigo-100',
    accent: 'text-indigo-700 dark:text-indigo-300',
  },
  quiz: {
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    border: 'border-l-violet-500',
    text: 'text-violet-900 dark:text-violet-100',
    accent: 'text-violet-700 dark:text-violet-300',
  },
  orga: {
    bg: 'bg-slate-100 dark:bg-slate-900/60',
    border: 'border-l-slate-500',
    text: 'text-slate-900 dark:text-slate-100',
    accent: 'text-slate-700 dark:text-slate-300',
  },
  special: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-l-amber-500',
    text: 'text-amber-900 dark:text-amber-100',
    accent: 'text-amber-800 dark:text-amber-300',
  },
  break: {
    bg: 'bg-neutral-100 dark:bg-neutral-900/60',
    border: 'border-l-neutral-400',
    text: 'text-neutral-800 dark:text-neutral-200',
    accent: 'text-neutral-600 dark:text-neutral-400',
  },
};
