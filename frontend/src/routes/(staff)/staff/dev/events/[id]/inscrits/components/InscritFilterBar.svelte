<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import ArrowDownAZ from '@lucide/svelte/icons/arrow-down-az';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import { cn } from '$lib/utils';
  import { niveauLabel } from '$lib/domain/niveau';
  import type { Sort } from './types';

  let {
    searchQuery = $bindable(''),
    niveauFilter = $bindable<'all' | string>('all'),
    sort = $bindable<Sort>('alpha'),
    availableNiveaux,
  }: {
    searchQuery?: string;
    niveauFilter?: 'all' | string;
    sort?: Sort;
    availableNiveaux: string[];
  } = $props();

  const SORT_LABELS: Record<Sort, string> = {
    alpha: 'Alphabétique',
    xp: 'XP descendant',
    events: 'Plus de participations',
  };

  let showNiveauPills = $derived(availableNiveaux.length >= 2);
</script>

<div class="space-y-3">
  <div class="flex flex-col gap-3 sm:flex-row">
    <div class="relative flex-1">
      <Search class="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Rechercher un stagiaire..."
        class="rounded-sm bg-card pl-8"
        bind:value={searchQuery}
      />
    </div>
    <Select.Root type="single" bind:value={sort}>
      <Select.Trigger class="rounded-sm sm:w-56">
        <span class="flex items-center gap-2">
          <ArrowDownAZ class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-sm">{SORT_LABELS[sort]}</span>
        </span>
      </Select.Trigger>
      <Select.Content>
        {#each Object.entries(SORT_LABELS) as [value, label]}
          <Select.Item {value}>{label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  {#if showNiveauPills}
    <div class="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onclick={() => (niveauFilter = 'all')}
        class={cn(
          'cursor-pointer rounded-sm px-2 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors',
          niveauFilter === 'all'
            ? 'bg-epi-blue text-white'
            : 'bg-muted text-muted-foreground hover:bg-muted/70',
        )}
      >
        Tous
      </button>
      {#each availableNiveaux as n}
        <button
          type="button"
          onclick={() => (niveauFilter = n)}
          class={cn(
            'cursor-pointer rounded-sm px-2 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors',
            niveauFilter === n
              ? 'bg-epi-blue text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/70',
          )}
        >
          {niveauLabel(n)}
        </button>
      {/each}
    </div>
  {/if}
</div>
