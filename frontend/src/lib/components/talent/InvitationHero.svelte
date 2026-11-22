<script lang="ts">
  import CopiedPicture from '#lib/components/talent/CopiedPicture.svelte';
  import EventFacts from '#lib/components/talent/EventFacts.svelte';
  import EventVisual from '#lib/components/talent/EventVisual.svelte';
  import PageHero from '#lib/components/layout/PageHero.svelte';
  import TitleCursor from '#lib/components/layout/TitleCursor.svelte';
  import { Button } from '#lib/components/ui/button/index.ts';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import type { HomeHero } from '#lib/domain/talentHome.ts';

  // « À ne pas manquer »: what a campus invites its talents to, to a talent
  // not enrolled in it (`pickHomeHero`). Either an event the campus puts
  // forward, with its days, its place and the words it wrote for this stage
  // (#501), or the campus's standing invitation (« Les Ateliers TECH »), which
  // has neither. Both leave Jump for an outside sign-up form, in a new tab.
  //
  // An event always has a visual: its picture, or the one the mockup draws
  // from its name. A picture may fail to load (a seeded environment has no
  // bytes behind its key): the event's drawn visual takes its place, and the
  // standing invitation stands on its words and the brand ground.
  let {
    hero,
  }: { hero: Extract<HomeHero, { kind: 'invitation' | 'generic' }> } = $props();

  const content = $derived(
    hero.kind === 'invitation'
      ? {
          title: hero.copy.title ?? hero.event.name,
          text: hero.copy.text,
          url: hero.event.signupUrl,
          buttonLabel: hero.copy.buttonLabel,
          image: hero.event.image,
        }
      : {
          title: hero.invitation.title,
          text: hero.invitation.text,
          url: hero.invitation.url,
          buttonLabel: hero.buttonLabel,
          image: hero.invitation.image,
        },
  );

  let broken = $state(false);
  const picture = $derived(content.image && !broken ? content.image : null);
  const event = $derived(hero.kind === 'invitation' ? hero.event : null);
</script>

<section aria-labelledby="invitation-hero-title">
  <PageHero density="compact" pixels={!picture && !event} class="rounded-xl">
    <div class="flex flex-col gap-5">
      <p class="epi-overline text-white/80">À ne pas manquer</p>

      <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <h2
            id="invitation-hero-title"
            class="font-heading text-display-m text-white sm:text-display-l"
          >
            {content.title}<TitleCursor />
          </h2>
          {#if event}
            <EventFacts {event} />
          {/if}
          {#if content.text}
            <p class="max-w-prose text-sm text-white/80">{content.text}</p>
          {/if}
        </div>

        {#if picture}
          <!-- A rectangle, no radius and no shadow (DESIGN.md: images). -->
          <CopiedPicture
            {picture}
            layout="hero"
            onBroken={() => (broken = true)}
          />
        {:else if event}
          <EventVisual name={event.name} categoryColor={event.categoryColor} />
        {/if}
      </div>

      <Button
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        variant="neon"
        class="h-11 w-full px-5 sm:w-auto sm:self-start"
      >
        {content.buttonLabel}
        {#if event}
          <ArrowRight class="size-4" aria-hidden="true" />
        {:else}
          <ExternalLink class="size-4" aria-hidden="true" />
        {/if}
        <span class="sr-only">(nouvel onglet)</span>
      </Button>
    </div>
  </PageHero>
</section>
