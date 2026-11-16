<script lang="ts">
  import { resolve } from '$app/paths';
  import Clock from '@lucide/svelte/icons/clock';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import { Card } from '$lib/components/ui/card';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { minutesToHHMM } from '$lib/domain/event';
  import type { PlanningView } from '$lib/domain/talentPlanning';

  // The talent's own session, small and sober, and only when it serves: the
  // date of the next one (what a pre-camp mailing asks them to come and check),
  // or the way into the schedule while a stage with one is running. It is
  // never an invitation (that is the hero's) and never a button of the hero's
  // weight, so it cannot compete with the hero on an event day. That is why it
  // is a white card in the 2027 mockup's card language (overline, large title,
  // icon lines) and not the mockup's blue invitation card: the blue belongs to
  // the hero.
  //
  // Present only in those two cases: an event running without a schedule, or
  // nothing planned at all, leaves no card rather than an empty one. The host
  // checks `showsSessionCard` before mounting it.
  let {
    planning,
    timeZone,
  }: {
    planning: Extract<PlanningView, { state: 'ongoing' | 'upcoming' }>;
    timeZone: string;
  } = $props();

  const titleId = $props.id();

  // « Mardi 26 octobre », on the talent's own clock so the server render and
  // the browser agree. It opens the line, hence the capital.
  function day(date: Date | string): string {
    const text = new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone,
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Shown only once confirmed (`startMinutes` set on the admin events page): a
  // confidently wrong hour is worse for a student than none, so until then the
  // talent sees the day alone, never the stored date's meaningless midnight.
  const startTime = $derived(
    planning.state === 'upcoming' ? minutesToHHMM(planning.startMinutes) : '',
  );
</script>

<Card role="region" aria-labelledby={titleId} class="gap-3 p-6">
  {#if planning.state === 'upcoming'}
    <h2 id={titleId} class="epi-overline text-muted-foreground">
      Ta prochaine session
    </h2>
    <div class="min-w-0">
      <p class="font-heading text-display-l text-foreground">
        {day(planning.date)}<TitleCursor />
      </p>
      {#if startTime}
        <p
          class="mt-2 flex items-center gap-1.5 text-sm text-foreground-secondary"
        >
          <Clock class="size-4 shrink-0" aria-hidden="true" />
          À {startTime}
        </p>
      {/if}
      {#if planning.publicName}
        <p
          class="mt-1 flex items-center gap-1.5 text-sm text-foreground-secondary"
        >
          <CalendarDays class="size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{planning.publicName}</span>
        </p>
      {/if}
    </div>
  {:else}
    <h2 id={titleId} class="epi-overline text-muted-foreground">
      En ce moment
    </h2>
    <p class="font-heading text-display-l text-foreground">
      {planning.publicName ?? 'Ton événement'}<TitleCursor />
    </p>
    <a
      href={resolve('/calendar')}
      class="group inline-flex cursor-pointer items-center gap-1 self-start text-sm font-semibold text-primary hover:underline"
    >
      Voir le planning
      <ArrowRight
        class="size-4 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </a>
  {/if}
</Card>
