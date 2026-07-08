<script lang="ts">
  import type { PageData } from './$types';
  import EventPlanningView from './components/EventPlanningView.svelte';
  import { eventDisplayName } from '$lib/domain/event';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{eventDisplayName(data.event)} · Planning</title>
</svelte:head>

<!-- Keyed on the event so all per-event state (visible week, open preview)
     re-seeds when staff switch events; see EventPlanningView. -->
{#key data.event.id}
  <EventPlanningView
    event={data.event}
    planning={data.planning}
    timezone={data.timezone}
    serverNow={data.serverNow}
  />
{/key}
