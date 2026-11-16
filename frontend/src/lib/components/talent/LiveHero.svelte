<script lang="ts">
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import StepProgress from '$lib/components/talent/StepProgress.svelte';
  import { Button } from '$lib/components/ui/button';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import { resolve } from '$app/paths';
  import { cn } from '$lib/utils';
  import { HERO_DEFAULT_BUTTON, liveHeroHeader } from '$lib/domain/eventHero';
  import type { HomeHero } from '$lib/domain/talentHome';
  import type { WorkshopActivity } from '$lib/domain/workshops';

  // The hero of a day the talent is at an event (`live`), and of a day with
  // nothing else to suggest but a subject they started (`continue`). On an
  // event day the hero is there to reach the subjects and nothing else (#412,
  // AC6), so it is the one neon action of the page.
  //
  // Several subjects at once are a choice, never a ranking (#501, AC2): a stage
  // de seconde offers three for a morning and the talent does one or two,
  // whichever they like. So they come as equal cards under one header, each
  // with the same button, and a started one stands apart only by its progress.
  // Not a carousel: it would show one choice at a time, and make the talent
  // wait for the one they came for.
  //
  // The header is the event's own words when it wrote some; otherwise a lone
  // subject titles the hero with its name and line, as the 2027 mockup draws
  // it, and a choice is named as one. With no subject at this moment (between
  // two half-days), the hero still says where the talent is, with the way into
  // the event's schedule: the card that used to hold that link is gone (AC11).
  let { hero }: { hero: Extract<HomeHero, { kind: 'live' | 'continue' }> } =
    $props();

  const subjects = $derived<WorkshopActivity[]>(
    hero.kind === 'live' ? hero.subjects : [hero.activity],
  );
  const header = $derived(
    hero.kind === 'live'
      ? liveHeroHeader(hero.copy, hero.event.name, hero.subjects)
      : {
          title: hero.activity.label,
          text: hero.activity.cover.tagline,
          subjectIsHeader: true,
        },
  );
  const buttonLabel = $derived(
    hero.kind === 'live' ? hero.copy.buttonLabel : HERO_DEFAULT_BUTTON.live,
  );
  const planning = $derived(hero.kind === 'live' && hero.event.hasPlanning);
  const regionName = $derived(
    hero.kind === 'live' ? 'En ce moment' : 'À continuer chez toi',
  );
</script>

{#snippet enter(subject: WorkshopActivity)}
  <!-- A form and not a link: entering mints a ticket and opens a
       participation, and `load` runs on speculative hover-preload.
       `target="_blank"` leaves this tab alive for the talent to come back to,
       which is where the XP are celebrated. -->
  <form method="POST" action={`/activites/${subject.slug}`} target="_blank">
    <Button
      type="submit"
      variant="neon"
      class={cn('h-11 w-full px-5', header.subjectIsHeader && 'sm:w-auto')}
    >
      {buttonLabel}
      <ArrowRight class="size-4" aria-hidden="true" />
      <span class="sr-only">{subject.label} (nouvel onglet)</span>
    </Button>
  </form>
{/snippet}

{#snippet planningLink()}
  <Button
    href={resolve('/calendar')}
    variant="overlay"
    class="h-11 w-full px-5 sm:w-auto"
  >
    <CalendarDays class="size-4" aria-hidden="true" />
    Voir le planning
  </Button>
{/snippet}

<section aria-labelledby="live-hero-region">
  <h2 id="live-hero-region" class="sr-only">{regionName}</h2>
  <PageHero density="compact" pixels={false} class="rounded-xl">
    <div class="flex flex-col gap-5">
      {#if hero.kind === 'live'}
        <p class="flex items-center gap-2 epi-overline text-white/80">
          <span
            class="size-2 shrink-0 rounded-full bg-epi-tech ring-3 ring-epi-tech/25"
            aria-hidden="true"
          ></span>
          En ce moment · {hero.event.name}
        </p>
      {:else}
        <p class="epi-overline text-white/80">À continuer chez toi</p>
      {/if}

      <div class="flex flex-col gap-2">
        <h3 class="font-heading text-display-m text-white sm:text-display-l">
          {header.title}<TitleCursor />
        </h3>
        {#if header.text}
          <p class="max-w-prose text-sm text-white/80">{header.text}</p>
        {/if}
      </div>

      {#if header.subjectIsHeader}
        <!-- One subject, already the header: its progress and its way in. -->
        <div class="max-w-md">
          <StepProgress activity={subjects[0]} />
        </div>
        <div class="flex flex-col gap-3 sm:flex-row">
          {@render enter(subjects[0])}
          {#if planning}
            {@render planningLink()}
          {/if}
        </div>
      {:else}
        {#if subjects.length > 0}
          <!-- One row per subject, stacked: the same width and the same way in
               for each, whatever their number. Side by side, three cards in
               the home's column came out narrower than their own button. -->
          <ul class="flex flex-col gap-3">
            {#each subjects as subject (subject.slug)}
              <li
                class="flex flex-col gap-4 rounded-lg border border-white/15 p-4 sm:flex-row sm:items-center sm:gap-6"
              >
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <h4 class="font-heading text-display-s text-white">
                    {subject.label}
                  </h4>
                  {#if subject.cover.tagline}
                    <p class="text-sm text-white/80">
                      {subject.cover.tagline}
                    </p>
                  {/if}
                </div>
                <div class="flex shrink-0 flex-col gap-3 sm:w-64">
                  <StepProgress activity={subject} />
                  {@render enter(subject)}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
        {#if planning}
          <div class="flex">{@render planningLink()}</div>
        {/if}
      {/if}
    </div>
  </PageHero>
</section>
