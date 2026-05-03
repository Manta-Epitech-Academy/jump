<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import { CalendarOff } from '@lucide/svelte';
  import { buttonVariants } from '$lib/components/ui/button';
  import PresencesHeader from './components/PresencesHeader.svelte';
  import SlotDayGroup from './components/SlotDayGroup.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.event.titre} — Présences</title>
</svelte:head>

<div class="flex h-full flex-col space-y-6 pb-10">
  <PresencesHeader event={data.event} totals={data.totals} />

  {#if data.activeDays.length === 0 && data.pastDays.length === 0}
    <div
      class="flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/30 p-12"
    >
      <div class="max-w-md text-center">
        <CalendarOff class="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 class="mt-4 text-base font-bold">Aucun créneau d'appel</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Ce stage ne contient pas encore d'activité de type « orga ».
          Ajoutez-en dans le planning pour piloter les appels ici.
        </p>
        <a
          href={resolve(`/staff/pedago/events/${data.event.id}/planning`)}
          class={buttonVariants({ variant: 'default', class: 'mt-4' })}
        >
          Ouvrir le planning
        </a>
      </div>
    </div>
  {:else}
    <div class="space-y-6">
      {#each data.activeDays as group (group.dateKey)}
        <SlotDayGroup
          dayLabel={group.dayLabel}
          slots={group.slots}
          eventId={data.event.id}
          timezone={data.timezone}
          primarySlotId={data.primarySlot?.activityId ?? null}
        />
      {/each}

      {#if data.pastDays.length > 0}
        <section class="space-y-4 pt-2">
          <header class="flex items-center gap-3">
            <h2
              class="text-sm font-black tracking-wider text-foreground uppercase"
            >
              Précédents
            </h2>
            <div class="h-px flex-1 bg-border"></div>
            <span
              class="text-[10px] font-medium text-muted-foreground uppercase"
            >
              {data.pastDays.length} jour{data.pastDays.length > 1 ? 's' : ''}
            </span>
          </header>
          <div class="space-y-6 opacity-80">
            {#each data.pastDays as group (group.dateKey)}
              <SlotDayGroup
                dayLabel={group.dayLabel}
                slots={group.slots}
                eventId={data.event.id}
                timezone={data.timezone}
                primarySlotId={data.primarySlot?.activityId ?? null}
              />
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>
