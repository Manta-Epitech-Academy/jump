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
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import { formatDateFr } from '$lib/utils';
  import { computeLevel } from '$lib/domain/xp';

  type Props = {
    student: { xp: number };
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
</script>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
  <KpiTile
    label="XP total"
    value={student.xp}
    sub={computeLevel(student.xp)}
    icon={Trophy}
    tone="orange"
  />
  <KpiTile
    label="Badges"
    value={`${badgeCounts.earned}/${badgeCounts.total}`}
    sub={badgeCounts.earned === 0
      ? 'Rien débloqué pour l’instant'
      : badgeCounts.earned === badgeCounts.total
        ? 'Catalogue complet'
        : 'Continuer à en débloquer'}
    icon={Award}
    tone="teal"
  />
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
  <KpiTile
    label="Dernière activité"
    value={relative ?? '—'}
    sub={absoluteLogin ?? 'Jamais connecté·e'}
    icon={Activity}
    tone="neutral"
  />
</div>
