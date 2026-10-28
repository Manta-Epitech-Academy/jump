<script lang="ts">
  import Timer from '@lucide/svelte/icons/timer';
  import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';

  // Where the event stands, as one line of its home's header, the mockup's:
  // « Ouverture dans 12 j 04 h », then « En cours », then « Terminé ».
  //
  // The opening is the effective one (`effectiveStartMinutes`): the hour a human
  // confirmed, else the default. Staff see that hour either way; only talents
  // are spared an unconfirmed one.
  //
  // It ticks once a minute, the finest unit it shows. The figures change in
  // place, so they are IBM Plex Sans and never Anton (`DESIGN.md`, Numbers).
  let {
    status,
    openDate,
  }: {
    status: EventLifecycleStatus;
    openDate: Date;
  } = $props();

  // An effect on `status`, not `onMount`: going from one event's home to
  // another's keeps this component and hands it the next event, which may be
  // the first one still to open.
  let now = $state(Date.now());
  $effect(() => {
    now = Date.now();
    if (status !== 'upcoming') return;
    const id = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(id);
  });

  const remaining = $derived(Math.max(0, new Date(openDate).getTime() - now));
  const days = $derived(Math.floor(remaining / 86_400_000));
  const hours = $derived(Math.floor((remaining % 86_400_000) / 3_600_000));
</script>

<p class="flex items-center gap-2 text-sm font-bold text-primary">
  <Timer class="size-4" aria-hidden="true" />
  {#if status === 'upcoming'}
    Ouverture dans {days}&nbsp;j {String(hours).padStart(2, '0')}&nbsp;h
  {:else if status === 'ongoing'}
    En cours
  {:else}
    Terminé
  {/if}
</p>
