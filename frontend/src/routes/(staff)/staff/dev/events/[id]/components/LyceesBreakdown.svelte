<script lang="ts">
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import { resolve } from '$app/paths';
  import OriginBreakdownCard, {
    type BreakdownRow,
  } from './OriginBreakdownCard.svelte';

  type LyceeRow = {
    schoolId: string;
    name: string;
    count: number;
  };

  /**
   * The server caps `rows` to a top-N; `others` summarises the truncated tail
   * so the user never thinks the visible rows are exhaustive.
   */
  type Breakdown = {
    rows: LyceeRow[];
    others: { count: number; categories: number } | null;
  };

  type Props = {
    eventId: string;
    breakdown: Breakdown;
    /** Cohort-member noun [singular, plural] for the "Autres" / filter labels. */
    itemNoun: [string, string];
    totalParticipations: number;
    /**
     * When the surrounding page is already filtered to a lycée, its row is
     * highlighted as the active facet (used on the Inscrits sidebar; the
     * dashboard leaves it unset).
     */
    activeSchoolId?: string;
    /**
     * Builds each row's link. Defaults to a fresh `?lycee=` on the Inscrits
     * page (dashboard drill-down). The Inscrits page overrides it to merge the
     * facet into the current URL, so an active interest filter survives.
     */
    hrefFor?: (schoolId: string) => string;
    /**
     * Lycées past the visible cap. Passing them turns the "Autres" summary into
     * an expander, so the Inscrits sidebar reaches any lycée without a separate
     * dropdown. Omitted on the dashboard (read-only summary).
     */
    tailRows?: LyceeRow[];
    interaction?: 'navigate' | 'filter' | 'readonly';
    /** Filter mode: href that clears the active lycée facet. */
    clearHref?: string;
  };

  let {
    eventId,
    breakdown,
    itemNoun,
    totalParticipations,
    activeSchoolId,
    hrefFor,
    tailRows,
    interaction = 'navigate',
    clearHref,
  }: Props = $props();

  const inscritsBase = $derived(
    resolve(`/staff/dev/events/${eventId}/inscrits`),
  );
  const linkFor = $derived(
    hrefFor ??
      ((schoolId: string) =>
        `${inscritsBase}?lycee=${encodeURIComponent(schoolId)}`),
  );

  const toRow = (l: LyceeRow): BreakdownRow => ({
    id: l.schoolId,
    label: l.name,
    count: l.count,
  });
  const rows = $derived(breakdown.rows.map(toRow));
  const tail = $derived(tailRows?.map(toRow));
</script>

<OriginBreakdownCard
  title="Lycées"
  {rows}
  tailRows={tail}
  others={breakdown.others}
  tailNoun={{
    item: itemNoun,
    category: ['lycée', 'lycées'],
  }}
  {totalParticipations}
  activeId={activeSchoolId}
  {interaction}
  hrefFor={linkFor}
  {clearHref}
  emptyText="Aucun lycée renseigné pour les inscrits."
>
  {#snippet icon()}
    <GraduationCap class="h-5 w-5 text-epi-blue" />
  {/snippet}
</OriginBreakdownCard>
