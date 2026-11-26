<!--
  EpiDuck drawn in a page that has no header to swim in (#540): the welcome
  screen, where he introduces himself, and the émargement, where he confirms
  the talent is there. He comes in (out of the water on the welcome, a hop of
  joy on the émargement), faces the talent, and his bubble opens under him.

  The bubble holds the line of his moment, from the controller (`lineFor`),
  so it is the admin's, rotated as every other: with no live line he says
  nothing. A page can put its own words in his mouth above that line
  (`children`): the welcome screen's title and the check-in's « C'est noté »
  are his, so the screen has one voice rather than a duck and a page saying
  the same thing side by side.

  Drawn by the server with everything else, and his entrance is CSS that
  starts from the first paint: the duck and his bubble hold their room from
  the start, so nothing under them moves when they appear. Drawn after
  hydration instead, the bubble pushed the whole page down when it arrived.
  The bubble waits for the entrance to end (`.emerge + .said`), the mockup's
  1.8s way up (`EMERGE_MS`) or the 480ms hop.

  Drawn asleep or awake: sleep quiets what he does of his own accord in the
  header, never his answer to what the talent just did (`mascot.md`).

  Less motion asked: he fades in, and his bubble after him.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    DEFAULT_MASCOT_LOOK,
    MASCOT_MOMENTS,
    type MascotCue,
  } from '#lib/domain/mascot.ts';
  import EpiDuck, { STAGE_ATLAS_URL } from './EpiDuck.svelte';
  import MascotBubble from './MascotBubble.svelte';
  import { useMascot } from './mascotController.svelte.ts';

  let {
    cue,
    atlas = 'lane',
    entrance,
    class: className,
    children,
  }: {
    cue: MascotCue;
    /** 'stage' when he is drawn larger than the settings card's 112px. */
    atlas?: 'lane' | 'stage';
    /** Out of the water, or a hop of joy. */
    entrance: 'emerge' | 'hop';
    /** His size. */
    class?: string;
    /** The page's own words, said by him above his line. */
    children?: Snippet;
  } = $props();

  const mascot = useMascot()();

  let look = $derived(mascot?.look ?? DEFAULT_MASCOT_LOOK);
  let line = $derived(mascot?.lineFor(cue) ?? null);
</script>

<svelte:head>
  {#if atlas === 'stage'}
    <!-- The large duck is in no stylesheet: fetched with the page, so the way
         up does not start before there is a duck to bring up. -->
    <link rel="preload" as="image" href={STAGE_ATLAS_URL} />
  {/if}
</svelte:head>

<div class="flex flex-col items-center gap-4">
  <div class="duck origin-bottom {entrance}">
    <EpiDuck
      {atlas}
      pose="front"
      {look}
      eyes={MASCOT_MOMENTS[cue.moment].mood === 'joy' ? 'joy' : 'open'}
      class={className}
    />
  </div>
  {#if children || line}
    <div class="said flex w-full justify-center">
      <MascotBubble class="max-w-md space-y-2 text-center">
        {@render children?.()}
        {#if line}<p>{line}</p>{/if}
      </MascotBubble>
    </div>
  {/if}
</div>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .emerge {
      animation: cameo-emerge 1800ms ease-out backwards;
    }
    .hop {
      animation: cameo-hop 480ms ease-out backwards;
    }
    .said {
      animation: cameo-fade 200ms ease-out backwards;
    }
    .emerge + .said {
      animation-delay: 1800ms;
    }
    .hop + .said {
      animation-delay: 480ms;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .duck,
    .said {
      animation: cameo-fade 200ms ease-out backwards;
    }
    .said {
      animation-delay: 200ms;
    }
  }

  @keyframes cameo-emerge {
    0% {
      transform: translateY(60%) rotate(-12deg);
      opacity: 0;
    }
    70% {
      transform: translateY(-4%) rotate(4deg);
      opacity: 1;
    }
    100% {
      transform: translateY(0) rotate(0);
    }
  }

  @keyframes cameo-hop {
    0% {
      transform: translateY(0) scale(1, 1);
    }
    40% {
      transform: translateY(-14%) scale(0.95, 1.06);
    }
    75% {
      transform: translateY(0) scale(1.06, 0.94);
    }
    100% {
      transform: translateY(0) scale(1, 1);
    }
  }

  @keyframes cameo-fade {
    from {
      opacity: 0;
    }
  }
</style>
