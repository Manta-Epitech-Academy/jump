<script lang="ts">
  import type { Snippet } from 'svelte';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import Lock from '@lucide/svelte/icons/lock';
  import * as Card from '$lib/components/ui/card';
  import { cn } from '$lib/utils';
  import type { SlotStats } from '$lib/domain/eventPresence';

  let {
    slotLabel,
    stats,
    closed = false,
    stageRate = null,
    footer,
  }: {
    /** Active half-day label (Matin / Après-midi). */
    slotLabel: string;
    stats: SlotStats;
    closed?: boolean;
    /** Whole-stage attendance rate, null until any créneau is émargé. */
    stageRate?: number | null;
    /** Optional slot-lifecycle control (open/close), rendered in the card footer
     *  so it sits with the Clôturé badge it toggles. Omitted for read-only staff. */
    footer?: Snippet;
  } = $props();

  // Order matters: the stacked bar reads left-to-right in the same order as the
  // legend, so colour ↔ count stay aligned.
  const segments = $derived([
    {
      key: 'present',
      label: 'Présents',
      value: stats.present,
      fill: 'bg-emerald-500',
    },
    {
      key: 'late',
      label: 'En retard',
      value: stats.late,
      fill: 'bg-amber-500',
    },
    {
      key: 'absent',
      label: 'Absents',
      value: stats.absent,
      fill: 'bg-red-500',
    },
    {
      key: 'excused',
      label: 'Justifiés',
      value: stats.excused,
      fill: 'bg-sky-500',
    },
    {
      key: 'pending',
      label: 'En attente',
      value: stats.pending,
      fill: 'bg-muted-foreground/30',
    },
  ]);

  const pct = (n: number) =>
    stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
  const handled = $derived(stats.total - stats.pending);
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <ClipboardCheck class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
      Synthèse
    </h3>
    {#if closed}
      <span
        class="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-300"
      >
        <Lock class="h-3 w-3" /> Clôturé
      </span>
    {/if}
  </div>

  <Card.Content class="space-y-3 p-4">
    <div>
      <p
        class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        {slotLabel}
      </p>
      <div class="mt-1 flex items-baseline gap-2">
        <span class="text-3xl leading-none font-extrabold text-foreground">
          {stats.presentPct}%
        </span>
        <span class="text-xs text-muted-foreground">présents</span>
      </div>
    </div>

    <!-- Stacked distribution: the composition at a glance (one segment per state,
         widths proportional to the counts) rather than a single ambiguous bar. -->
    {#if stats.total > 0}
      <div
        class="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label="Répartition des présences du créneau"
      >
        {#each segments as s (s.key)}
          {#if s.value > 0}
            <div
              class={s.fill}
              style={`width:${(s.value / stats.total) * 100}%`}
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
            <span class="font-bold text-foreground tabular-nums">{s.value}</span
            >
            <span class="w-9 text-right text-muted-foreground/70 tabular-nums">
              {pct(s.value)}%
            </span>
          </dd>
        </div>
      {/each}
    </dl>

    <div class="space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
      <p>
        <span class="font-bold text-foreground tabular-nums">{handled}</span
        >/{stats.total} émargés sur ce créneau
      </p>
      {#if stageRate !== null}
        <p>
          Présence globale :
          <span class="font-bold text-foreground tabular-nums"
            >{stageRate}%</span
          >
          <span class="text-muted-foreground/70">sur les créneaux émargés</span>
        </p>
      {/if}
    </div>
  </Card.Content>

  {#if footer}
    <div class="border-t p-4">
      {@render footer()}
    </div>
  {/if}
</Card.Root>
