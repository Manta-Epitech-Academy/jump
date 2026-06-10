<script lang="ts">
  import type { PageData } from './$types';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import EventPlanningView from './components/EventPlanningView.svelte';

  let { data }: { data: PageData } = $props();

  // Stage-only release has shallow page depth, so the breadcrumb is noise; it
  // only earns its place once coding_club deepens the workspace.
  let hasCodingClub = $derived(
    (data.featureFlags ?? []).includes('coding_club'),
  );
</script>

<svelte:head>
  <title>{STAGE_SECONDE_LABEL} — Planning</title>
</svelte:head>

<!-- Keyed on the event so all per-event state (visible week, open preview)
     re-seeds when staff switch events; see EventPlanningView. -->
{#key data.event.id}
  <EventPlanningView
    event={data.event}
    planning={data.planning}
    timezone={data.timezone}
    serverNow={data.serverNow}
    {hasCodingClub}
  />
{/key}
