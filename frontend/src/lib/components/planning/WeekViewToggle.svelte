<script lang="ts">
  import { onMount } from 'svelte';
  import SegmentedFilter, {
    type SegmentOption,
  } from '$lib/components/staff/SegmentedFilter.svelte';
  import type { WeekView } from '$lib/domain/calendarWeek';

  // Switch between the work-week (Mon-Fri) and full-week (Mon-Sun) calendar
  // layouts. Shared by the talent calendar and the dev event planning so the two
  // surfaces keep the same labels and persistence and can't drift apart. The
  // initial view is seeded by the parent from the data (see pickInitialWeekView);
  // this component owns only the restore/persist of an explicit choice on top.
  //
  // The choice persists per browser: a week layout is a display preference, and
  // a returning visitor's only sensible default is "what you last picked".
  // localStorage (not a DB column) is the right scope for a per-device,
  // client-only cosmetic toggle. It's read after mount (localStorage is
  // client-only, so SSR renders the seeded view first) and written on every
  // change; the `loaded` gate keeps the first write from clobbering the stored
  // value before it's read back.
  const STORAGE_KEY = 'calendar-week-view';

  let { value = $bindable('work') }: { value?: WeekView } = $props();

  let loaded = $state(false);
  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'work' || stored === 'full') value = stored;
    loaded = true;
  });
  $effect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, value);
  });

  const options: SegmentOption[] = [
    { value: 'work', label: 'Semaine de travail' },
    { value: 'full', label: 'Semaine' },
  ];
</script>

<SegmentedFilter
  {options}
  {value}
  onChange={(v) => (value = v as WeekView)}
  ariaLabel="Affichage de la semaine"
/>
