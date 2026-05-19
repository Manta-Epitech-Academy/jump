<script lang="ts" module>
  /**
   * Returns a short French relative-time string (`aujourd'hui`, `hier`,
   * `il y a 3j`, ...) for a past instant. Returns `null` for null/future.
   */
  export function relativeFr(d: Date | null): string | null {
    if (!d) return null;
    const ms = Date.now() - d.getTime();
    if (ms < 0) return null;
    const day = 86_400_000;
    const days = Math.floor(ms / day);
    if (days === 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${days} j`;
    if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `il y a ${weeks} sem`;
    }
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `il y a ${months} mois`;
    }
    const years = Math.floor(days / 365);
    return `il y a ${years} an${years > 1 ? 's' : ''}`;
  }
</script>

<script lang="ts">
  import Trophy from '@lucide/svelte/icons/trophy';
  import Award from '@lucide/svelte/icons/award';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Activity from '@lucide/svelte/icons/activity';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import KpiCelebration from '$lib/components/staff/KpiCelebration.svelte';
  import { formatDateFr } from '$lib/utils';

  type Props = {
    student: { xp: number; level: string | null };
    presentCount: number;
    totalEvents: number;
    lastActiveAt: Date | null;
    badgeCounts: { earned: number; total: number };
    timezone: string;
  };

  let {
    student,
    presentCount,
    totalEvents,
    lastActiveAt,
    badgeCounts,
    timezone,
  }: Props = $props();

  const hasParticipations = $derived(totalEvents > 0);
  const presencePct = $derived(
    hasParticipations ? Math.round((presentCount / totalEvents) * 100) : 0,
  );
  const relative = $derived(relativeFr(lastActiveAt));
  const absoluteLogin = $derived(
    lastActiveAt ? formatDateFr(lastActiveAt, timezone) : null,
  );

  const isAllBadges = $derived(
    badgeCounts.total > 0 && badgeCounts.earned === badgeCounts.total,
  );
  const is100Presence = $derived(hasParticipations && presencePct === 100);
</script>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
  <KpiTile
    label="XP total"
    value={student.xp}
    sub={student.level ?? undefined}
    icon={Trophy}
    tone="orange"
  />

  <KpiCelebration active={isAllBadges} tone="teal" badgeIcon={Award}>
    <KpiTile
      label="Badges"
      value={`${badgeCounts.earned}/${badgeCounts.total}`}
      sub={badgeCounts.earned === 0
        ? 'Rien débloqué pour l’instant'
        : isAllBadges
          ? 'Catalogue complet !'
          : 'Continuer à en débloquer'}
      icon={Award}
      tone="teal"
    />
  </KpiCelebration>

  <KpiCelebration active={is100Presence} tone="blue" badgeIcon={CheckCircle2}>
    <KpiTile
      label="Présence"
      value={hasParticipations ? `${presencePct}%` : '—'}
      sub={hasParticipations
        ? 'sur l’ensemble des événements'
        : 'Aucune participation'}
      icon={Calendar}
      tone="blue"
      progress={hasParticipations ? presencePct : undefined}
    />
  </KpiCelebration>

  <KpiTile
    label="Dernière activité"
    value={relative ?? '—'}
    sub={absoluteLogin ?? 'Jamais connecté·e'}
    icon={Activity}
    tone="neutral"
  />
</div>
