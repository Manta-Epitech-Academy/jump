<script lang="ts">
  import Calendar from '@lucide/svelte/icons/calendar';
  import { resolve } from '$app/paths';
  import { Badge } from '$lib/components/ui/badge';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { cn, formatDateFr } from '$lib/utils';
  import {
    INTERVIEW_DISPLAY_LABELS,
    INTERVIEW_STATUS_CHIP_CLASS,
    getInterviewDisplayStatus,
  } from '$lib/domain/interview';
  import { getLifecycleBounds } from '$lib/domain/eventLifecycle';
  import RecommendationChip from '../../../events/[id]/interviews/components/RecommendationChip.svelte';
  import type { InterviewRecommendation } from '@prisma/client';

  type Interview = {
    id: string;
    date: Date | string;
    status: 'planned' | 'completed' | 'cancelled';
    globalNote?: string | null;
    recommendation?: InterviewRecommendation | null;
    staff: { user: { name: string | null } | null } | null;
    participation: { event: { id: string; titre: string } } | null;
  };

  let { interviews, timezone }: { interviews: Interview[]; timezone: string } =
    $props();

  const bounds = $derived(getLifecycleBounds(timezone));
</script>

<EpiSection overline="Suivi" title="Entretiens" accent="blue">
  {#snippet meta()}
    <span
      class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      {interviews.length}
    </span>
  {/snippet}

  {#if interviews.length === 0}
    <p class="text-sm text-muted-foreground italic">
      Aucun entretien enregistré.
    </p>
  {:else}
    <ul class="space-y-3">
      {#each interviews as iv (iv.id)}
        {@const state = getInterviewDisplayStatus(
          { date: new Date(iv.date), status: iv.status },
          bounds,
        )}
        <li class="space-y-2 rounded-sm border border-border bg-card p-3">
          <div class="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              class={cn(
                'rounded-sm px-1.5 py-0 text-[10px] font-bold uppercase',
                INTERVIEW_STATUS_CHIP_CLASS[state],
              )}
            >
              {INTERVIEW_DISPLAY_LABELS[state]}
            </Badge>
            <span
              class="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <Calendar class="h-3 w-3" />
              {formatDateFr(iv.date, timezone)}
            </span>
            {#if iv.staff?.user?.name}
              <span class="text-xs text-muted-foreground">
                · Mené par <span class="font-medium text-foreground"
                  >{iv.staff.user.name}</span
                >
              </span>
            {/if}
            {#if iv.recommendation}
              <RecommendationChip value={iv.recommendation} variant="full" />
            {/if}
          </div>
          {#if iv.participation?.event}
            <p class="text-[11px] text-muted-foreground">
              <a
                href={resolve(`/staff/dev/events/${iv.participation.event.id}`)}
                class="font-bold uppercase transition-colors hover:text-epi-blue"
              >
                {iv.participation.event.titre}
              </a>
            </p>
          {/if}
          {#if iv.globalNote}
            <!-- Mirrors the blockquote in InterviewRecoCard: neutral surface
                 with an epi-teal left border so verbatim notes share the
                 same on-brand quote treatment everywhere they appear. -->
            <blockquote
              class="border-l-2 border-epi-teal-solid/60 bg-muted/30 py-1.5 pl-3 text-xs leading-relaxed text-foreground/80 italic"
            >
              « {iv.globalNote} »
            </blockquote>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</EpiSection>
