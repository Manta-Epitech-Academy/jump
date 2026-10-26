<script lang="ts" module>
  export type CampusCalendarView = 'year' | 'list';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import SegmentedFilter, {
    type SegmentOption,
  } from '$lib/components/staff/SegmentedFilter.svelte';

  // The campus calendar's two views. Which one a person reads is a display
  // preference of theirs, kept per browser like the planning's week layout
  // (`WeekViewToggle`, which says why localStorage is the right scope): read
  // after mount, so the server renders the year view first.
  const STORAGE_KEY = 'campus-calendar-view';

  let { value = $bindable('year') }: { value?: CampusCalendarView } = $props();

  let loaded = $state(false);
  onMount(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'year' || stored === 'list') value = stored;
    } catch {
      // Storage refused (private window): the year view stays.
    }
    loaded = true;
  });
  $effect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage refused: the choice lasts as long as the page.
    }
  });

  const options: SegmentOption[] = [
    { value: 'year', label: 'Année' },
    { value: 'list', label: 'Liste' },
  ];
</script>

<SegmentedFilter
  {options}
  {value}
  onChange={(v) => (value = v as CampusCalendarView)}
  ariaLabel="Affichage du calendrier"
/>
