<script lang="ts">
  import type { Snippet } from 'svelte';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import Lock from '@lucide/svelte/icons/lock';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import * as Card from '$lib/components/ui/card';
  import { cn } from '$lib/utils';
  import { statusBadgeClass } from '$lib/components/staff/statusBadge';
  import type { SlotStats } from '$lib/domain/eventPresence';
  import { allPresentLine } from '$lib/domain/devVoice';

  let {
    slotLabel,
    slotKey,
    stats,
    closed = false,
    stageRate = null,
    footer,
  }: {
    /** Active half-day label (Matin / Après-midi). */
    slotLabel: string;
    /** The créneau, day and half-day: it keys the line said when everyone is there. */
    slotKey: string;
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
      fill: 'bg-success',
    },
    {
      key: 'late',
      label: 'En retard',
      value: stats.late,
      fill: 'bg-warning',
    },
    {
      key: 'absent',
      label: 'Absents',
      value: stats.absent,
      fill: 'bg-destructive',
    },
    {
      key: 'excused',
      label: 'Justifiés',
      value: stats.excused,
      fill: 'bg-primary',
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
  // Everyone listed is there, late included: derived from the live stats, so it
  // shows the moment the last talent is marked, during the appel.
  const allPresent = $derived(
    stats.total > 0 && stats.present + stats.late === stats.total,
  );
</script>

<Card.Root class="rounded-sm">
  <div
    class="flex flex-row items-center gap-2 border-b bg-muted/30 px-6 pt-4 pb-3"
  >
    <ClipboardCheck class="h-5 w-5 text-epi-blue" />
    <h3 class="font-heading text-display-m text-foreground">Synthèse</h3>
    {#if closed}
      <span class={cn('ml-auto', statusBadgeClass('neutral'))}>
        <Lock class="h-3 w-3" /> Clôturé
      </span>
    {/if}
  </div>

  <Card.Content class="space-y-3 p-4">
    <div>
      <p class="epi-overline text-muted-foreground">
        {slotLabel}
      </p>
      <div class="mt-1 flex items-baseline gap-2">
        <span class="text-3xl leading-none font-bold text-foreground">
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

    {#if allPresent}
      <p class="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <CheckCheck class="h-4 w-4 shrink-0 text-epi-tech-ink" />
        {allPresentLine(slotKey)}
      </p>
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

    <div class="space-y-1 border-t pt-2 text-xs text-muted-foreground">
      <p>
        <span class="font-bold text-foreground">{handled}</span>/{stats.total} émargés
        sur ce créneau
      </p>
      {#if stageRate !== null}
        <p>
          Présence globale :
          <span class="font-bold text-foreground">{stageRate}%</span>
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
