<script lang="ts">
  import ActivityHero from './ActivityHero.svelte';
  import HighlightHero from './HighlightHero.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { countdownLabel, type HomeHero } from '$lib/domain/talentHome';

  // The blue zone at the head of a talent's home: the one place where Jump
  // says what to do now. What it holds is decided server-side by
  // `pickHomeHero`; this only picks the shape that renders it.
  let { hero }: { hero: HomeHero } = $props();
</script>

{#if hero.kind === 'live' && hero.subjects.length > 0}
  <ActivityHero activities={hero.subjects} context="today" />
{:else if hero.kind === 'live' || hero.kind === 'enrolled'}
  <section aria-labelledby="event-hero-title">
    <PageHero density="compact" class="rounded-xl">
      <p class="epi-overline text-white/80">
        {hero.kind === 'live'
          ? `En ce moment · ${hero.event.name}`
          : `Tu es inscrit · ${countdownLabel(hero.countdownDays)}`}
      </p>
      <h2
        id="event-hero-title"
        class="mt-2 font-heading text-display-m text-white sm:text-display-l"
      >
        {hero.copy.title ?? hero.event.name}<TitleCursor />
      </h2>
    </PageHero>
  </section>
{:else if hero.kind === 'invitation'}
  <HighlightHero
    invitation={{
      title: hero.copy.title ?? hero.event.name,
      text: hero.copy.text ?? '',
      url: hero.event.signupUrl,
      buttonLabel: hero.copy.buttonLabel,
      image: hero.event.image,
    }}
  />
{:else if hero.kind === 'generic'}
  <HighlightHero
    invitation={{ ...hero.invitation, buttonLabel: hero.buttonLabel }}
  />
{:else}
  <ActivityHero activities={[hero.activity]} context="continue" />
{/if}
