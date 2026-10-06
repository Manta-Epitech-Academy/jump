<script lang="ts">
  import { resolve } from '$app/paths';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { minutesToHHMM } from '$lib/domain/event';
  import type { PlanningView } from '$lib/domain/talentPlanning';

  // The talent's own session, small and sober, and only when it serves: the
  // date of the next one (what a pre-camp mailing asks them to come and check),
  // or the way into the schedule while a stage with one is running. It is
  // never an invitation (that is the hero's) and never a button of the hero's
  // weight, so it cannot compete with the hero on an event day.
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

  // « mardi 26 octobre », on the talent's own clock so the server render and
  // the browser agree.
  const day = (date: Date | string) =>
    new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone,
    });

  // Shown only once confirmed (`startMinutes` set on the admin events page): a
  // confidently wrong hour is worse for a student than none, so until then the
  // talent sees the day alone, never the stored date's meaningless midnight.
  const startTime = $derived(
    planning.state === 'upcoming' ? minutesToHHMM(planning.startMinutes) : '',
  );
</script>

<section
  aria-labelledby={titleId}
  class="flex items-start gap-3 rounded-xl border border-border bg-card px-6 py-4 shadow-raised"
>
  <CalendarClock
    class="mt-0.5 size-4 shrink-0 text-epi-blue"
    aria-hidden="true"
  />
  <div class="min-w-0">
    {#if planning.state === 'upcoming'}
      <h2 id={titleId} class="text-sm font-bold text-foreground">
        Ta prochaine session
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {#if planning.publicName}{planning.publicName},{' '}{/if}<span
          class="font-semibold text-foreground-secondary"
          >{day(planning.date)}</span
        >{#if startTime}{' '}à
          <span class="font-semibold text-foreground-secondary"
            >{startTime}</span
          >{/if}
      </p>
    {:else}
      <h2 id={titleId} class="text-sm font-bold text-foreground">
        {planning.publicName ?? 'Ton événement'} est en cours
      </h2>
      <a
        href={resolve('/calendar')}
        class="group mt-1 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-epi-blue hover:underline"
      >
        Voir le planning
        <ArrowRight
          class="size-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </a>
    {/if}
  </div>
</section>
