<script lang="ts">
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { Button } from '$lib/components/ui/button';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { cn } from '$lib/utils';
  import {
    formatHighlightDay,
    type TalentHomeHighlight,
  } from '$lib/domain/talentHome';

  // The event the talent's campus invites them to, leading the home's hero on a
  // day they have no activity (`pickHomeHero`). Same surface and same shape as
  // an activity in the hero, so the blue zone always reads as « where Jump tells
  // you what to do », whatever it holds that day; its button leaves Jump for
  // the outside sign-up form, which the trailing glyph says before the click
  // does.
  //
  // The picture is optional and may fail to load (a seeded environment has no
  // bytes behind its key): the hero then stands on its words and the brand
  // ground, which has to read as finished, not as broken.
  let { highlight }: { highlight: TalentHomeHighlight } = $props();

  let broken = $state(false);
  const picture = $derived(highlight.image && !broken ? highlight.image : null);
</script>

<section aria-labelledby="highlight-hero-title">
  <PageHero density="compact" pixels={!picture} class="rounded-xl">
    <article
      class={cn(
        'flex flex-col gap-5',
        picture && 'sm:flex-row-reverse sm:items-center sm:gap-6',
      )}
    >
      {#if picture}
        <!-- A rectangle, no radius and no shadow (DESIGN.md: images). -->
        <img
          src={picture.url}
          width={picture.width}
          height={picture.height}
          alt=""
          decoding="async"
          onerror={() => (broken = true)}
          class="block h-auto w-full shrink-0 ring-1 ring-white/20 sm:w-2/5"
        />
      {/if}

      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <p class="epi-overline text-white/80">
            À ne pas manquer · Le {formatHighlightDay(highlight.date)}
          </p>
          <h2
            id="highlight-hero-title"
            class="mt-2 font-heading text-display-m text-white sm:text-display-l"
          >
            {highlight.title}<TitleCursor />
          </h2>
        </div>

        <p class="max-w-prose text-sm text-white/80">{highlight.summary}</p>

        <Button
          href={highlight.url}
          target="_blank"
          rel="noopener noreferrer"
          variant="neon"
          class="w-full sm:w-auto sm:self-start"
        >
          Je m’inscris
          <ExternalLink class="size-4" aria-hidden="true" />
          <span class="sr-only">(nouvel onglet)</span>
        </Button>
      </div>
    </article>
  </PageHero>
</section>
