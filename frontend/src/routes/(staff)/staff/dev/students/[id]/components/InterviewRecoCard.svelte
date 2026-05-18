<script lang="ts">
  import type { InterviewRecommendation } from '@prisma/client';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import { resolve } from '$app/paths';
  import RecommendationChip from '../../../events/[id]/interviews/components/RecommendationChip.svelte';
  import { formatDateFr } from '$lib/utils';

  /**
   * Sticky "what did the interview decide" card on the Pédagogie tab.
   * Dark variant — the only deliberately dark surface on the page; it makes
   * the recommendation chip pop while the rest of the column stays light.
   */
  type Props = {
    interview: {
      id: string;
      date: Date | string;
      status: string;
      recommendation: InterviewRecommendation | null;
      globalNote: string | null;
      staff: { user: { name: string | null } | null } | null;
      participation: { event: { id: string; titre: string } | null } | null;
    } | null;
    timezone: string;
  };

  let { interview, timezone }: Props = $props();
</script>

<div
  class="relative overflow-hidden rounded-sm bg-zinc-950 p-5 text-white shadow-md dark:shadow-none dark:ring-1 dark:ring-white/10"
>
  <p
    class="flex items-center gap-2 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
  >
    <MessageSquare class="h-3.5 w-3.5" />
    Entretien d'orientation
  </p>

  {#if interview && interview.recommendation}
    <div class="mt-4 flex items-center gap-2">
      <RecommendationChip
        value={interview.recommendation}
        variant="full"
        size="md"
      />
    </div>
    <p class="mt-3 text-xs text-zinc-400">
      Mené par
      <span class="text-zinc-100">{interview.staff?.user?.name ?? 'Staff'}</span
      >
      le
      <span class="text-zinc-100">{formatDateFr(interview.date, timezone)}</span
      >
    </p>
    {#if interview.globalNote}
      <blockquote
        class="mt-3 line-clamp-3 border-l-2 border-epi-teal/60 pl-3 text-sm text-zinc-300 italic"
      >
        « {interview.globalNote} »
      </blockquote>
    {/if}
    {#if interview.participation?.event}
      <a
        href={resolve(
          `/staff/dev/events/${interview.participation.event.id}/interviews`,
        )}
        class="mt-4 inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase hover:underline"
      >
        Voir la grille &rarr;
      </a>
    {/if}
  {:else}
    <p class="mt-4 text-sm text-zinc-300">
      Pas encore d'entretien — orientation à déterminer.
    </p>
    <p class="mt-2 text-xs text-zinc-500">
      La recommandation apparaîtra dès qu'un staff aura clôturé une grille.
    </p>
  {/if}
</div>
