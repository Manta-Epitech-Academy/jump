<script lang="ts">
  import CopiedPicture from '$lib/components/talent/CopiedPicture.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { Button } from '$lib/components/ui/button';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { cn } from '$lib/utils';
  import { HERO_DEFAULT_BUTTON } from '$lib/domain/eventHero';
  import type { CampusInvitation } from '$lib/domain/talentHome';

  // The campus's generic invitation, leading the home's hero on a day the
  // talent has no activity (`pickHomeHero`). Same surface and same shape as
  // an activity in the hero, so the blue zone always reads as « where Jump tells
  // you what to do », whatever it holds that day; its button leaves Jump for
  // the outside sign-up form, which the trailing glyph says before the click
  // does.
  //
  // The picture is optional and may fail to load (a seeded environment has no
  // bytes behind its key): the hero then stands on its words and the brand
  // ground, which has to read as finished, not as broken.
  let { invitation }: { invitation: CampusInvitation } = $props();

  let broken = $state(false);
  const picture = $derived(
    invitation.image && !broken ? invitation.image : null,
  );
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
        <!-- A rectangle, no radius and no shadow (DESIGN.md: images),
             bounded like an activity's visual whatever its proportion. -->
        <CopiedPicture
          {picture}
          layout="hero"
          onBroken={() => (broken = true)}
        />
      {/if}

      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <p class="epi-overline text-white/80">À ne pas manquer</p>
          <h2
            id="highlight-hero-title"
            class="mt-2 font-heading text-display-m text-white sm:text-display-l"
          >
            {invitation.title}<TitleCursor />
          </h2>
        </div>

        <p class="max-w-prose text-sm text-white/80">{invitation.text}</p>

        <Button
          href={invitation.url}
          target="_blank"
          rel="noopener noreferrer"
          variant="neon"
          class="w-full sm:w-auto sm:self-start"
        >
          {invitation.buttonLabel ?? HERO_DEFAULT_BUTTON.invitation}
          <ExternalLink class="size-4" aria-hidden="true" />
          <span class="sr-only">(nouvel onglet)</span>
        </Button>
      </div>
    </article>
  </PageHero>
</section>
