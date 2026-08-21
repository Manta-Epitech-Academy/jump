<script lang="ts">
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import * as Card from '$lib/components/ui/card';
  import { cn } from '$lib/utils';
  import type { InterviewRecommendation } from '@prisma/client';
  import {
    INTERVIEW_RECOMMENDATIONS,
    INTERVIEW_RECOMMENDATION_VALUES,
    type RecommendationToneToken,
  } from '$lib/domain/interview';

  let {
    counts,
    total,
    recoCounts,
  }: {
    counts: { todo: number; in_progress: number; done: number };
    total: number;
    recoCounts: Record<InterviewRecommendation, number>;
  } = $props();

  // Left-to-right in the same order as the legend so colour ↔ count stay aligned.
  const segments = $derived([
    {
      key: 'done',
      label: 'Finalisés',
      value: counts.done,
      fill: 'bg-epi-tech-ink',
    },
    {
      key: 'in_progress',
      label: 'En cours',
      value: counts.in_progress,
      fill: 'bg-epi-together',
    },
    {
      key: 'todo',
      label: 'À faire',
      value: counts.todo,
      fill: 'bg-muted-foreground/30',
    },
  ]);

  const donePct = $derived(
    total > 0 ? Math.round((counts.done / total) * 100) : 0,
  );
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const recoTotal = $derived(
    INTERVIEW_RECOMMENDATION_VALUES.reduce((s, v) => s + recoCounts[v], 0),
  );

  const TONE_DOT: Record<RecommendationToneToken, string> = {
    'epi-tech': 'bg-epi-tech-ink',
    'epi-blue': 'bg-epi-blue',
    'epi-tomorrow': 'bg-epi-tomorrow',
    'epi-drift': 'bg-muted-foreground/40',
  };
</script>

<Card.Root class="rounded-sm shadow-raised">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <ClipboardCheck class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-display-m text-foreground">Synthèse</h3>
  </div>

  <Card.Content class="space-y-3 p-4">
    <div>
      <div class="flex items-baseline gap-2">
        <span class="text-3xl leading-none font-bold text-foreground">
          {donePct}%
        </span>
        <span class="text-xs text-muted-foreground">finalisés</span>
      </div>
    </div>

    {#if total > 0}
      <div
        class="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label="Répartition des entretiens par statut"
      >
        {#each segments as s (s.key)}
          {#if s.value > 0}
            <div
              class={s.fill}
              style={`width:${(s.value / total) * 100}%`}
            ></div>
          {/if}
        {/each}
      </div>
    {/if}

    <dl class="space-y-1.5">
      {#each segments as s (s.key)}
        <div class="flex items-center justify-between gap-2 text-xs">
          <dt class="flex items-center gap-1.5 text-muted-foreground">
            <span class={cn('inline-block size-2 rounded-full', s.fill)}></span>
            {s.label}
          </dt>
          <dd class="flex items-baseline gap-2">
            <span class="font-bold text-foreground">{s.value}</span>
            <span class="w-9 text-right text-muted-foreground/70">
              {pct(s.value)}%
            </span>
          </dd>
        </div>
      {/each}
    </dl>

    {#if recoTotal > 0}
      <div class="space-y-1.5 border-t pt-2.5">
        <p class="epi-overline text-muted-foreground">Avis sur les finalisés</p>
        {#each INTERVIEW_RECOMMENDATION_VALUES as value (value)}
          {#if recoCounts[value] > 0}
            {@const desc = INTERVIEW_RECOMMENDATIONS[value]}
            <div class="flex items-center justify-between gap-2 text-xs">
              <span class="flex items-center gap-1.5 text-muted-foreground">
                <span
                  class={cn(
                    'inline-block size-2 rounded-full',
                    TONE_DOT[desc.tone],
                  )}
                ></span>
                {desc.label}
              </span>
              <span class="font-bold text-foreground">
                {recoCounts[value]}
              </span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
