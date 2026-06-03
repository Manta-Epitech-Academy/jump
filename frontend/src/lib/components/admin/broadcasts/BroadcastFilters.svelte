<script lang="ts">
  import type { BroadcastAudience } from '@prisma/client';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { Button } from '$lib/components/ui/button';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import {
    type BroadcastFilters,
    countActiveBroadcastFilters,
    JUMP_LEVELS,
    IMAGE_RIGHTS_FILTER_OPTIONS,
    IMAGE_RIGHTS_FILTER_LABELS,
    type TristateFilter,
  } from '$lib/domain/broadcasts';
  import { NIVEAUX, niveauLabel } from '$lib/domain/niveau';
  import { cn } from '$lib/utils';

  type Props = {
    /** Bindable; optional so it binds to a `BroadcastFilters | undefined`
     *  superform field. Defaults to an empty filter set. */
    filters?: BroadcastFilters;
    audience?: BroadcastAudience;
  };

  let { filters = $bindable({}), audience }: Props = $props();

  const targetsPeople = $derived(
    audience === 'talent' || audience === 'parent',
  );
  const activeCount = $derived(countActiveBroadcastFilters(filters));

  // Toggle a value inside one of the multi-select array fields.
  function toggle<T>(current: T[] | undefined, value: T, on: boolean): T[] {
    const set = new Set(current ?? []);
    if (on) set.add(value);
    else set.delete(value);
    return [...set];
  }

  const tristateOptions = [
    { value: 'any', label: 'Indifférent' },
    { value: 'yes', label: 'Oui' },
    { value: 'no', label: 'Non' },
  ];
  type TristateKey =
    | 'charterSigned'
    | 'rulesSigned'
    | 'parentRulesSigned'
    | 'hasPastEvent'
    | 'hasFutureEvent';
  // Grouped: compliance signatures/completion vs event participation.
  // `charterSigned` = `charterAcceptedAt` (RGPD data charter); the two
  // règlement rows are the distinct `rulesSignedAt` (élève) / `parentRulesSignedAt`
  // (guardian co-signature) signals.
  const tristateGroups: Array<{
    heading: string;
    items: Array<{ key: TristateKey; label: string }>;
  }> = [
    {
      heading: 'Conformité',
      items: [
        { key: 'charterSigned', label: 'Charte RGPD signée' },
        { key: 'rulesSigned', label: 'Règlement signé (élève)' },
        { key: 'parentRulesSigned', label: 'Règlement co-signé (parent)' },
      ],
    },
    {
      heading: 'Participation',
      items: [
        { key: 'hasPastEvent', label: 'A déjà participé' },
        { key: 'hasFutureEvent', label: 'Event à venir' },
      ],
    },
  ];

  function setTristate(key: TristateKey, v: string) {
    filters = {
      ...filters,
      [key]: v === 'any' ? undefined : (v as TristateFilter),
    };
  }
</script>

{#snippet chip(label: string, selected: boolean, onToggle: () => void)}
  <button
    type="button"
    aria-pressed={selected}
    onclick={onToggle}
    class={cn(
      'cursor-pointer rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors',
      selected
        ? 'border-epi-blue/40 bg-epi-blue/10 text-epi-blue'
        : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
    )}
  >
    {label}
  </button>
{/snippet}

{#if !targetsPeople}
  <p class="text-xs text-muted-foreground">
    Pas de filtres avancés pour cette audience.
  </p>
{:else}
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        {#if activeCount > 0}
          {activeCount} filtre{activeCount > 1 ? 's' : ''} actif{activeCount > 1
            ? 's'
            : ''}
        {:else}
          Aucun filtre — toute l'audience est ciblée.
        {/if}
      </p>
      {#if activeCount > 0}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-xs"
          onclick={() => (filters = {})}
        >
          <RotateCcw class="h-3 w-3" /> Réinitialiser
        </Button>
      {/if}
    </div>

    <div class="grid gap-1.5">
      <p class="text-xs font-medium">Niveau scolaire</p>
      <div class="flex flex-wrap gap-1.5">
        {#each NIVEAUX as n (n)}
          {@const selected = filters.niveau?.includes(n) ?? false}
          {@render chip(niveauLabel(n), selected, () => {
            filters = {
              ...filters,
              niveau: toggle(filters.niveau, n, !selected),
            };
          })}
        {/each}
      </div>
    </div>

    <div class="grid gap-1.5">
      <p class="text-xs font-medium">Niveau Jump</p>
      <div class="flex flex-wrap gap-1.5">
        {#each JUMP_LEVELS as lvl (lvl)}
          {@const selected = filters.jumpLevel?.includes(lvl) ?? false}
          {@render chip(lvl, selected, () => {
            filters = {
              ...filters,
              jumpLevel: toggle(filters.jumpLevel, lvl, !selected),
            };
          })}
        {/each}
      </div>
    </div>

    <div class="grid gap-1.5">
      <p class="text-xs font-medium">Droit à l'image</p>
      <div class="flex flex-wrap gap-1.5">
        {#each IMAGE_RIGHTS_FILTER_OPTIONS as status (status)}
          {@const selected = filters.imageRights?.includes(status) ?? false}
          {@render chip(IMAGE_RIGHTS_FILTER_LABELS[status], selected, () => {
            filters = {
              ...filters,
              imageRights: toggle(filters.imageRights, status, !selected),
            };
          })}
        {/each}
      </div>
    </div>

    {#each tristateGroups as group (group.heading)}
      <div class="grid gap-1.5">
        <p
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          {group.heading}
        </p>
        {#each group.items as t (t.key)}
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs font-medium">{t.label}</p>
            <SegmentedFilter
              options={tristateOptions}
              value={filters[t.key] ?? 'any'}
              onChange={(v) => setTristate(t.key, v)}
              ariaLabel={t.label}
            />
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}
