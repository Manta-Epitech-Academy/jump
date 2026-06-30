<script lang="ts">
  import type { PageData } from './$types';
  import { fly } from 'svelte/transition';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import CalendarCheck from '@lucide/svelte/icons/calendar-check';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { toDateKey } from '$lib/domain/eventPresence';

  let { data }: { data: PageData } = $props();

  // Group events by month for the timeline
  type GroupedMonth = {
    key: string;
    label: string;
    events: (typeof data.pastEvents)[number][];
  };

  let groupedMonths = $derived.by(() => {
    const map = new Map<string, (typeof data.pastEvents)[number][]>();
    for (const ev of data.pastEvents) {
      // Month bucket in the talent's timezone (`YYYY-MM` from the shared
      // day-key helper), so SSR on a UTC pod and the browser agree on the
      // month of a near-midnight event instead of hydrating with a flash.
      const key = toDateKey(new Date(ev.date), data.timeZone).slice(0, 7);
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);
    }
    const months: GroupedMonth[] = [];
    for (const [key, events] of map) {
      const d = new Date(events[0].date);
      const label = d.toLocaleDateString('fr-FR', {
        timeZone: data.timeZone,
        month: 'long',
        year: 'numeric',
      });
      months.push({ key, label, events });
    }
    return months;
  });
</script>

<svelte:head>
  <title>Mes événements</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
  <TalentPageHeader title="Mes événements" icon={CalendarCheck} />

  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    <!-- Hero -->
    <div
      class="mb-8 overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
      in:fly={{ y: -20, duration: 400 }}
    >
      <div class="flex items-center gap-4 px-5 py-4 sm:gap-5 sm:px-6">
        <div
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-epi-blue/10 ring-2 ring-epi-blue/30 dark:bg-epi-blue/20"
        >
          <div class="text-center">
            <div
              class="text-xl font-black tracking-tighter text-slate-900 dark:text-white"
            >
              {data.pastEvents.length}
            </div>
            <div class="text-[8px] font-bold text-epi-blue uppercase">
              événement{data.pastEvents.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <h2 class="text-base font-bold text-slate-900 dark:text-white">
            Événements passés
          </h2>
          <p class="text-sm text-slate-500">
            Tous les événements auxquels tu as participé.
          </p>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    {#if groupedMonths.length > 0}
      <div class="relative" in:fly={{ y: 20, duration: 400, delay: 200 }}>
        <!-- Vertical line -->
        <div
          class="absolute top-0 bottom-0 left-5 w-px bg-gradient-to-b from-epi-blue/40 via-epi-blue/20 to-transparent sm:left-6"
        ></div>

        <div class="space-y-8">
          {#each groupedMonths as month, monthIndex (month.key)}
            <!-- Month header -->
            <div class="relative flex items-center gap-3 pl-10 sm:pl-12">
              <h3
                class="text-xs font-bold tracking-wide text-slate-400 capitalize uppercase dark:text-slate-500"
              >
                {month.label}
              </h3>
              <span class="text-xs font-semibold text-epi-blue">
                {month.events.length} événement{month.events.length > 1
                  ? 's'
                  : ''}
              </span>
            </div>

            <!-- Events for this month -->
            <div
              class="ml-[1.125rem] space-y-3 border-l border-transparent pl-8 sm:ml-[1.375rem]"
            >
              {#each month.events as ev, eventIndex (ev.id)}
                <div
                  class="group relative overflow-hidden rounded-2xl border border-epi-blue/20 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-slate-900"
                  in:fly={{
                    x: -10,
                    duration: 300,
                    delay: Math.min(60 * eventIndex + 120 * monthIndex, 360),
                  }}
                >
                  <!-- Accent left bar -->
                  <div
                    class="absolute inset-y-0 left-0 w-1 bg-epi-blue/10 opacity-60"
                  ></div>

                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-epi-blue/10 dark:bg-epi-blue/20"
                    >
                      <Calendar class="h-5 w-5 text-epi-blue" />
                    </div>

                    <div class="min-w-0 flex-1">
                      <span
                        class="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        {ev.titre}
                      </span>
                      <div class="mt-0.5 text-xs text-slate-400">
                        {new Date(ev.date).toLocaleDateString('fr-FR', {
                          timeZone: data.timeZone,
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <!-- Timeline end marker -->
        <div class="relative mt-8 flex items-center gap-4">
          <div
            class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 ring-2 ring-slate-200 sm:h-12 sm:w-12 dark:bg-slate-800 dark:ring-slate-700"
          >
            <Sparkles class="h-4 w-4 text-slate-400" />
          </div>
          <p class="text-sm text-slate-400">Début de ton aventure Jump</p>
        </div>
      </div>
    {:else}
      <div
        class="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50"
      >
        <CalendarCheck class="mb-4 h-8 w-8 text-slate-400" />
        <h3 class="text-lg font-bold text-slate-700 dark:text-slate-300">
          Aucun événement
        </h3>
        <p class="mt-2 max-w-sm text-sm text-slate-500">
          Tes participations apparaîtront ici.
        </p>
      </div>
    {/if}
  </div>

  <TalentFooter />
</div>
