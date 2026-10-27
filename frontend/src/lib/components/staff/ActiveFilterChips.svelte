<script lang="ts" module>
  /** One active filter value, as the row of chips above a list shows it. */
  export type ActiveFilterChip = {
    /** Unique across the row, e.g. `lycee:<id>`. */
    id: string;
    /** What is filtered, "Lycée". */
    facet: string;
    /** The value kept, "Lycée Pasteur". */
    label: string;
    onRemove: () => void;
  };
</script>

<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import { Button } from '$lib/components/ui/button';

  // Every filter value in force, each one removable, and one control that
  // clears them all. It sits between a list's toolbar and its table, so what
  // narrows the list is read in one line wherever the filters were set (a
  // header funnel, the mobile drawer, a link that arrived filtered). Renders
  // nothing while no filter is active.
  let {
    chips,
    onReset,
  }: {
    chips: ActiveFilterChip[];
    onReset: () => void;
  } = $props();
</script>

{#if chips.length > 0}
  <div class="flex flex-wrap items-center gap-2">
    {#each chips as chip (chip.id)}
      <span
        class="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-0.5 pl-3 text-xs text-foreground-secondary"
      >
        <span>{chip.facet} :</span>
        <span class="font-semibold text-foreground">{chip.label}</span>
        <button
          type="button"
          onclick={chip.onRemove}
          aria-label={`Retirer le filtre ${chip.facet} : ${chip.label}`}
          class="inline-flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-foreground/10"
        >
          <X class="size-3" />
        </button>
      </span>
    {/each}
    <Button
      variant="ghost"
      size="sm"
      onclick={onReset}
      class="h-7 px-2 text-muted-foreground hover:text-foreground"
    >
      <FilterX class="mr-1.5 h-4 w-4" />
      Réinitialiser les filtres
    </Button>
  </div>
{/if}
