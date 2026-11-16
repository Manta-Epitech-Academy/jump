<script lang="ts">
  import CopiedPicture from '$lib/components/talent/CopiedPicture.svelte';
  import EventFacts from '$lib/components/talent/EventFacts.svelte';
  import EventVisual from '$lib/components/talent/EventVisual.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { Button } from '$lib/components/ui/button';
  import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
  import { resolve } from '$app/paths';
  import { countdownLabel, type HomeHero } from '$lib/domain/talentHome';

  // « Tu es inscrit »: the next event the talent is enrolled in, before it
  // starts (`pickHomeHero`). What a talent lives reflected back (#501): never
  // « inscris-toi » to someone already expected, but how many days are left,
  // the day and time they are expected, where, and a way to put it in their
  // own calendar that goes through no outside service (the calendar file is
  // Jump's own, `routes/(talent)/agenda/[eventId]`). Its name is always shown
  // (AC4), under the words the event wrote for this stage or the mockup's.
  let { hero }: { hero: Extract<HomeHero, { kind: 'enrolled' }> } = $props();

  let broken = $state(false);
  const picture = $derived(hero.image && !broken ? hero.image : null);
</script>

<section aria-labelledby="enrolled-hero-title">
  <PageHero density="compact" pixels={false} class="rounded-xl">
    <div class="flex flex-col gap-5">
      <div class="flex items-center justify-between gap-3">
        <p class="epi-overline text-white/80">Tu es inscrit</p>
        <!-- A day count, not a ticking figure: the body face, bold. -->
        <span
          class="rounded-full bg-epi-tech px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-epi-blue uppercase"
        >
          {countdownLabel(hero.countdownDays)}
        </span>
      </div>

      <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <h2
            id="enrolled-hero-title"
            class="font-heading text-display-m text-white sm:text-display-l"
          >
            {hero.copy.title}<TitleCursor />
          </h2>
          <p class="text-base font-bold text-white">{hero.event.name}</p>
          {#if hero.copy.text}
            <p class="max-w-prose text-sm text-white/80">{hero.copy.text}</p>
          {/if}
          <EventFacts event={hero.event} withArrival />
        </div>

        {#if picture}
          <CopiedPicture
            {picture}
            layout="hero"
            onBroken={() => (broken = true)}
          />
        {:else}
          <EventVisual
            name={hero.event.name}
            categoryColor={hero.event.categoryColor}
          />
        {/if}
      </div>

      <Button
        href={resolve(`/agenda/${hero.event.id}`)}
        download
        variant="overlay"
        class="h-11 w-full px-5 sm:w-auto sm:self-start"
      >
        {hero.copy.buttonLabel}
        <CalendarPlus class="size-4" aria-hidden="true" />
      </Button>
    </div>
  </PageHero>
</section>
