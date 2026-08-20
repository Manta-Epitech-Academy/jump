// Shared stage-status presentation for the welcome-pages picker and editor, so
// the badge labels/colours and the date range stay identical across both.
export type StageStatus = 'ongoing' | 'upcoming' | 'past';

export const STAGE_STATUS_META: Record<
  StageStatus,
  { label: string; class: string }
> = {
  ongoing: {
    label: 'En cours',
    class: 'bg-epi-tech/15 text-epi-tech-ink border-epi-tech/30',
  },
  upcoming: {
    label: 'À venir',
    class: 'bg-epi-blue/10 text-epi-blue border-epi-blue/20',
  },
  past: { label: 'Archivé', class: 'bg-muted text-muted-foreground' },
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** Formats an ISO start/end pair as `12 juin 2026 → 26 juin 2026`. */
export function formatStageRange(startIso: string, endIso: string): string {
  return `${dateFmt.format(new Date(startIso))} → ${dateFmt.format(new Date(endIso))}`;
}

/** Formats an ISO timestamp as `12 juin 14:30`. */
export function formatEditedAt(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}
