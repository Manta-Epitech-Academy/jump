<script lang="ts">
  import EventCategoryChip from '$lib/components/events/EventCategoryChip.svelte';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import type { CampusCalendar } from '$lib/domain/campusCalendar';

  // What the colours on the calendar mean. An indication, never a filter: the
  // mockup draws it as plain labels, and so does this.
  let { legend }: { legend: CampusCalendar['legend'] } = $props();
</script>

<ul
  aria-label="Légende"
  class="flex flex-wrap items-center gap-x-4.5 gap-y-2 text-sm font-medium"
>
  {#each legend.categories as category (category.key)}
    <li><EventCategoryChip {category} /></li>
  {/each}
  {#if legend.uncategorized}
    <li class="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        class="size-2.5 shrink-0 rounded-sm bg-muted-foreground"
      ></span>
      Sans catégorie
    </li>
  {/if}
  {#if legend.offDays !== 'none'}
    <li class="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        class="size-2.5 shrink-0 rounded-sm border border-foreground/25 bg-muted"
      ></span>
      {#if legend.offDays === 'known'}
        Vacances &amp; jours fériés
      {:else}
        Jours fériés
        <InfoTooltip
          text="Les vacances scolaires de cette année ne sont pas encore publiées par le ministère."
        />
      {/if}
    </li>
  {/if}
</ul>
