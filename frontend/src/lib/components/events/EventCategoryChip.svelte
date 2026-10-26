<script lang="ts">
  import type { EventCategoryView } from '$lib/domain/eventCategory';

  // An event's category as every screen names it: its colour as a swatch beside
  // the label. The colour is whatever the team picked, so the swatch carries a
  // border: a near-white one still shows on a white card, a near-black one in
  // the dark theme. An archived category is still shown on the events that carry
  // it, and says so.
  let {
    category,
  }: { category: Pick<EventCategoryView, 'label' | 'color' | 'archived'> } =
    $props();
</script>

<span class="inline-flex min-w-0 items-center gap-2">
  <!-- The custom property carries the authored colour, which no class can know
       in advance. -->
  <span
    aria-hidden="true"
    class="size-2.5 shrink-0 rounded-sm border border-border bg-[var(--category-color)]"
    style:--category-color={category.color}
  ></span>
  <span class="truncate">{category.label}</span>
  {#if category.archived}
    <span class="shrink-0 text-xs text-muted-foreground">archivée</span>
  {/if}
</span>
