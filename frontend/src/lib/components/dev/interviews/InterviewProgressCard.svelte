<script lang="ts">
  import type { Snippet } from 'svelte';
  import ClipboardList from '@lucide/svelte/icons/clipboard-list';
  import CircleCheckBig from '@lucide/svelte/icons/circle-check-big';
  import * as Card from '$lib/components/ui/card';
  import { cn } from '$lib/utils';
  import type { InterviewStatus } from '@prisma/client';

  // Right-rail companion to InterviewGrid in interview mode: the grille title,
  // its lifecycle state and the ★-questions progress, lifted out of the grid so
  // it sits next to the guide while the questions stay on the left. The optional
  // `footer` carries the lifecycle controls + save indicator (the fiche wires
  // them to the grid), so the controls live with the status they act on.
  let {
    status,
    done,
    total,
    footer,
  }: {
    status: InterviewStatus | null;
    done: number;
    total: number;
    footer?: Snippet;
  } = $props();

  const pct = $derived(total > 0 ? Math.round((done / total) * 100) : 0);
  const allDone = $derived(total > 0 && done >= total);
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <ClipboardList class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
      Entretien
    </h3>
  </div>

  <Card.Content class="space-y-3 p-4">
    <div class="flex items-center justify-between gap-2">
      {#if status === 'done'}
        <span
          class="inline-flex items-center gap-1 rounded-full border border-epi-teal-solid/40 bg-epi-teal-solid/10 px-2 py-0.5 text-xs font-bold tracking-wide text-epi-teal-solid uppercase"
        >
          <CircleCheckBig class="h-3 w-3" /> Finalisé
        </span>
      {:else if status === 'in_progress'}
        <span
          class="inline-flex items-center gap-1 rounded-full border border-epi-orange/40 bg-epi-orange/10 px-2 py-0.5 text-xs font-bold tracking-wide text-epi-orange uppercase"
        >
          En cours
        </span>
      {:else}
        <span
          class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-bold tracking-wide text-muted-foreground uppercase"
        >
          À faire
        </span>
      {/if}
      <!-- ★-count and bar are zeroes until the interview starts, so they only
           appear once there's progress to show — the "À faire" chip carries the
           not-started state on its own. -->
      {#if status !== null}
        <span
          class={cn(
            'font-mono text-xs font-bold tracking-widest uppercase',
            allDone ? 'text-epi-teal-solid' : 'text-muted-foreground',
          )}
        >
          {done}/{total} ★
        </span>
      {/if}
    </div>

    {#if status !== null}
      <div
        class="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label="Progression des questions incontournables"
      >
        <div
          class={cn(
            'transition-all',
            allDone ? 'bg-epi-teal-solid' : 'bg-epi-blue',
          )}
          style={`width:${pct}%`}
        ></div>
      </div>
    {/if}

    {#if footer}
      <div class="space-y-2 border-t pt-3">
        {@render footer()}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
