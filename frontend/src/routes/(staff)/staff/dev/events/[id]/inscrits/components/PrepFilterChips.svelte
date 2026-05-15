<script lang="ts">
  import { cn } from '$lib/utils';
  import type { FilterCounts, FilterKey } from './types';

  let {
    filter,
    counts,
    onFilterChange,
  }: {
    filter: FilterKey;
    counts: FilterCounts;
    onFilterChange: (next: FilterKey) => void;
  } = $props();

  type Chip = { key: FilterKey; label: string; count: number };

  const chips = $derived<Chip[]>([
    { key: 'all', label: 'Tous', count: counts.all },
    {
      key: 'never-logged',
      label: 'Jamais connectés',
      count: counts.neverLogged,
    },
    {
      key: 'profile-incomplete',
      label: 'Profil incomplet',
      count: counts.profileIncomplete,
    },
  ]);
</script>

<div class="flex flex-wrap items-center gap-2">
  {#each chips as chip (chip.key)}
    {@const active = filter === chip.key}
    <button
      type="button"
      onclick={() => onFilterChange(chip.key)}
      class={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-sm border px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors',
        active
          ? 'border-epi-blue bg-epi-blue text-white'
          : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50 hover:text-foreground',
      )}
      aria-pressed={active}
    >
      <span>{chip.label}</span>
      <span
        class={cn(
          'inline-flex min-w-5 justify-center rounded-sm px-1 font-mono text-[10px] tabular-nums',
          active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
        )}
      >
        {chip.count}
      </span>
    </button>
  {/each}
</div>
