<script lang="ts">
  import { onMount } from 'svelte';
  import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';

  // Sidebar-sized echo of the preparation hero countdown. Same data, compact
  // chrome: a dark blueprint card that ticks to the stage opening, then folds
  // into a "Jour N" / "Terminé" status once the stage is live or over.
  type Props = {
    status: EventLifecycleStatus;
    /** Effective opening instant (confirmed time, else the type default). */
    openDate: Date;
    /** Stage closing instant — drives the "terminé le" line. */
    endDate: Date;
    /** Day index / span, only meaningful while ongoing. */
    dayN: number;
    totalDays: number;
    timezone: string;
  };

  let { status, openDate, endDate, dayN, totalDays, timezone }: Props =
    $props();

  // openDate/endDate arrive as Dates over the load boundary, but wrap defensively
  // in case a caller hands strings.
  const open = $derived(new Date(openDate));
  const end = $derived(new Date(endDate));

  let now = $state(Date.now());
  onMount(() => {
    if (status !== 'upcoming') return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const remaining = $derived(Math.max(0, open.getTime() - now));
  const days = $derived(Math.floor(remaining / 86_400_000));
  const hours = $derived(Math.floor((remaining % 86_400_000) / 3_600_000));
  const minutes = $derived(Math.floor((remaining % 3_600_000) / 60_000));
  const pad = (n: number) => String(n).padStart(2, '0');

  const endLabel = $derived(
    end.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: timezone,
    }),
  );
</script>

<div
  class="relative overflow-hidden rounded-sm bg-epi-blue px-5 py-5 text-white shadow-sm dark:shadow-none"
>
  <!-- Blueprint grid texture (charte signature), echoing the prep hero. -->
  <div
    class="pointer-events-none absolute inset-0"
    style="background-image: linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px); background-size: 28px 28px;"
    aria-hidden="true"
  ></div>

  <div class="relative z-10">
    {#if status === 'upcoming'}
      <p
        class="font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
      >
        <span class="opacity-60">&lt;</span> Ouverture dans
        <span class="opacity-60">/&gt;</span>
      </p>
      <div
        class="mt-3 flex items-baseline justify-center gap-3 font-heading leading-none"
      >
        <div class="flex flex-col items-center">
          <span class="text-5xl tracking-wide">{pad(days)}</span>
          <span
            class="mt-1.5 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
            >jours</span
          >
        </div>
        <span class="-mx-1 text-4xl text-white/30">:</span>
        <div class="flex flex-col items-center">
          <span class="text-5xl tracking-wide">{pad(hours)}</span>
          <span
            class="mt-1.5 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
            >heures</span
          >
        </div>
        <span class="-mx-1 text-4xl text-white/30">:</span>
        <div class="flex flex-col items-center">
          <span class="text-5xl tracking-wide">{pad(minutes)}</span>
          <span
            class="mt-1.5 font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
            >min</span
          >
        </div>
      </div>
    {:else if status === 'ongoing'}
      <p
        class="font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
      >
        <span class="opacity-60">&lt;</span> Stage en cours
        <span class="opacity-60">/&gt;</span>
      </p>
      <div class="mt-3 flex items-baseline gap-2 font-heading leading-none">
        <span class="text-6xl tracking-wide">J{dayN}</span>
        <span class="font-mono text-sm font-bold text-white/70"
          >/ {totalDays} jours</span
        >
      </div>
    {:else}
      <p
        class="font-mono text-[10px] font-bold tracking-widest text-white/60 uppercase"
      >
        <span class="opacity-60">&lt;</span> Stage terminé
        <span class="opacity-60">/&gt;</span>
      </p>
      <p class="mt-3 text-sm font-medium text-blue-100">
        Clôturé le <span class="font-bold text-white">{endLabel}</span>
      </p>
    {/if}
  </div>
</div>
