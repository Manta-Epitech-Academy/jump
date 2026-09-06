<script lang="ts">
  import Sparkle from '@lucide/svelte/icons/sparkle';
  import { resolve } from '$app/paths';
  import OriginBreakdownCard, {
    type BreakdownRow,
  } from './OriginBreakdownCard.svelte';

  type InterestRow = {
    interestId: string;
    nom: string;
    emoji: string | null;
    count: number;
  };

  /**
   * The server caps `rows` to a top-N; `others.count` is the sum of tail
   * declarations (one inscrit picking 3 tail interests adds 3), labelled
   * "déclarations" rather than a head count because it's not a unique-person count.
   */
  type Breakdown = {
    rows: InterestRow[];
    others: { count: number; categories: number } | null;
  };

  type Props = {
    eventId: string;
    breakdown: Breakdown;
    /** Cohort size: denominator for the proportion bar. */
    totalParticipations: number;
    /**
     * When the surrounding page is already filtered to an interest, its row is
     * highlighted as the active facet (Inscrits sidebar; unset on the dashboard).
     */
    activeInterestId?: string;
    /**
     * Builds each row's link. Defaults to a fresh `?interest=` on the Inscrits
     * page; the Inscrits page overrides it to merge the facet into the current
     * URL so an active lycée filter survives.
     */
    hrefFor?: (interestId: string) => string;
    /**
     * Interests past the visible cap. Passing them turns the "Autres" summary
     * into an expander, so a tail interest stays filterable from the Inscrits
     * sidebar without a separate dropdown. Omitted on the dashboard.
     */
    tailRows?: InterestRow[];
    interaction?: 'navigate' | 'filter' | 'readonly';
    /** Filter mode: href that clears the active interest facet. */
    clearHref?: string;
    /** Header label. Override when the breakdown is scoped (e.g. tech-only). */
    title?: string;
  };

  let {
    eventId,
    breakdown,
    totalParticipations,
    activeInterestId,
    hrefFor,
    tailRows,
    interaction = 'navigate',
    clearHref,
    title = 'Centres d’intérêt déclarés',
  }: Props = $props();

  const inscritsBase = $derived(
    resolve(`/staff/dev/events/${eventId}/inscrits`),
  );
  const linkFor = $derived(
    hrefFor ??
      ((interestId: string) => `${inscritsBase}?interest=${interestId}`),
  );

  const toRow = (i: InterestRow): BreakdownRow => ({
    id: i.interestId,
    label: i.nom,
    emoji: i.emoji,
    count: i.count,
  });
  const rows = $derived(breakdown.rows.map(toRow));
  const tail = $derived(tailRows?.map(toRow));
</script>

<OriginBreakdownCard
  {title}
  {rows}
  tailRows={tail}
  others={breakdown.others}
  tailNoun={{
    item: ['déclaration', 'déclarations'],
    category: ['centre', 'centres'],
  }}
  {totalParticipations}
  activeId={activeInterestId}
  {interaction}
  hrefFor={linkFor}
  {clearHref}
  emptyText="Aucun centre d’intérêt renseigné pour les inscrits."
>
  {#snippet icon()}
    <Sparkle class="h-5 w-5 text-epi-blue" />
  {/snippet}
</OriginBreakdownCard>
