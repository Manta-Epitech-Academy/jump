<script lang="ts" module>
  export type InterviewFilter = 'all' | 'todo' | 'planned' | 'done';
</script>

<script lang="ts">
  import { cn } from '$lib/utils';

  type Counts = {
    all: number;
    todo: number;
    planned: number;
    done: number;
  };

  type Props = {
    filter: InterviewFilter;
    counts: Counts;
    onFilterChange: (next: InterviewFilter) => void;
  };

  let { filter, counts, onFilterChange }: Props = $props();

  type Chip = { key: InterviewFilter; label: string; count: number };

  let chips = $derived<Chip[]>([
    { key: 'all', label: 'Tous', count: counts.all },
    { key: 'todo', label: 'À faire', count: counts.todo },
    { key: 'planned', label: 'Planifiés', count: counts.planned },
    { key: 'done', label: 'Terminés', count: counts.done },
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
