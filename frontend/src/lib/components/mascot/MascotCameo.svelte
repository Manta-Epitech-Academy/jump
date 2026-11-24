<!--
  EpiDuck drawn in a page that has no header to swim in (#540): the welcome
  screen, where he introduces himself, and the émargement, where he confirms
  the talent is there. He comes in (out of the water on the welcome, a hop of
  joy on the émargement), faces the talent and says the line of his moment.

  The line is the controller's (`lineFor`), so it is the admin's, rotated as
  every other: with no live line he is there and says nothing. Asleep, he is
  not drawn at all, as nowhere else: the talent asked for quiet, and the page
  keeps its own picture.

  Drawn once the page is in the browser, never by the server: he arrives, and
  an entrance replayed over a duck already painted would flash.

  Less motion asked: he fades in, and his line after him.
-->
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { page } from '$app/state';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fade } from '#lib/motion/index.ts';
  import {
    DEFAULT_MASCOT_LOOK,
    MASCOT_MOMENTS,
    mascotLookOf,
    type MascotCue,
  } from '#lib/domain/mascot.ts';
  import EpiDuck from './EpiDuck.svelte';
  import { EMERGE_MS, useMascot } from './mascotController.svelte.ts';

  let {
    cue,
    atlas = 'lane',
    entrance,
    class: className,
    fallback,
  }: {
    cue: MascotCue;
    /** 'stage' when he is drawn larger than the settings card's 112px. */
    atlas?: 'lane' | 'stage';
    /** Out of the water, or a hop of joy. */
    entrance: 'emerge' | 'hop';
    /** His size. */
    class?: string;
    /** What the page shows in his place when he is asleep. */
    fallback?: Snippet;
  } = $props();

  const mascot = useMascot()();
  const HOP_MS = 480;

  let look = $derived(
    page.data.talent ? mascotLookOf(page.data.talent) : DEFAULT_MASCOT_LOOK,
  );
  let line = $derived(mascot?.lineFor(cue) ?? null);
  let mounted = $state(false);
  let spoken = $state(false);
  let duck = $state<HTMLDivElement>();

  onMount(() => {
    mounted = true;
    if (!mascot || mascot.asleep) return;
    const reduced = prefersReducedMotion.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // After the paint that put him in the page, so the entrance has a start.
    const frame = requestAnimationFrame(() => {
      const ms = reduced ? 200 : entrance === 'emerge' ? EMERGE_MS : HOP_MS;
      duck?.animate(
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : entrance === 'emerge'
            ? [
                { transform: 'translateY(60%) rotate(-12deg)', opacity: 0 },
                {
                  transform: 'translateY(-4%) rotate(4deg)',
                  opacity: 1,
                  offset: 0.7,
                },
                { transform: 'translateY(0) rotate(0)', opacity: 1 },
              ]
            : [
                { transform: 'translateY(0) scale(1, 1)' },
                {
                  transform: 'translateY(-14%) scale(0.95, 1.06)',
                  offset: 0.4,
                },
                { transform: 'translateY(0) scale(1.06, 0.94)', offset: 0.75 },
                { transform: 'translateY(0) scale(1, 1)' },
              ],
        { duration: ms, easing: 'ease-out', fill: 'backwards' },
      );
      timer = setTimeout(() => (spoken = true), ms);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  });
</script>

{#if mascot && !mascot.asleep}
  <div class="flex flex-col items-center gap-3">
    <div class="origin-bottom" bind:this={duck}>
      {#if mounted}
        <EpiDuck
          {atlas}
          pose="front"
          {look}
          eyes={MASCOT_MOMENTS[cue.moment].mood === 'joy' ? 'joy' : 'open'}
          class={className}
        />
      {:else}
        <!-- His room, held while the page hydrates. -->
        <div class={className}></div>
      {/if}
    </div>
    {#if spoken && line}
      <p
        in:fade
        role="status"
        class="max-w-72 rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm leading-snug font-bold text-primary shadow-overlay"
      >
        {line}
      </p>
    {/if}
  </div>
{:else}
  {@render fallback?.()}
{/if}
