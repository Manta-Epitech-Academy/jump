<script lang="ts">
  import CopiedPicture from '#lib/components/talent/CopiedPicture.svelte';
  import EventVisual from '#lib/components/talent/EventVisual.svelte';
  import type { WorkshopActivity } from '#lib/domain/workshops.ts';

  // How a subject shows itself in the home's hero: its cover, authored over
  // the API (`write_workshop`, `cover`) and copied into Jump, moving or still.
  // A talent who asked for reduced motion gets the poster (`CopiedPicture`).
  //
  // A subject always has a visual, as an event does: without a cover, or with
  // one that fails to load (its stored object gone, or a database seeded with
  // no bytes behind its keys), the drawn « {EPITECH} NAME_ » block takes its
  // place, coloured like the event offering it. So the hero's picture column
  // is never a hole, and a row of choices never has one tile shorter than the
  // others.
  let {
    activity,
    categoryColor,
    layout,
  }: {
    activity: WorkshopActivity;
    categoryColor: string | null;
    /** The picture column of a hero, or the full width of one choice tile. */
    layout: 'hero' | 'tile';
  } = $props();

  // Pictures that failed to load, by URL, so a broken one leaves no hole.
  let broken = $state<Record<string, true>>({});
  const loads = (url: string | undefined) => !!url && !broken[url];
  const markBroken = (url: string) => (broken = { ...broken, [url]: true });

  const picture = $derived.by(() => {
    const cover = activity.cover;
    const still = loads(cover.poster?.url) ? cover.poster : null;
    const moving = loads(cover.media?.url) ? cover.media : null;
    const main = moving ?? still;
    return main ? { main, still } : null;
  });
</script>

{#if picture}
  <!-- A rectangle, no radius and no shadow (DESIGN.md: images). -->
  <CopiedPicture
    picture={picture.main}
    still={picture.still}
    {layout}
    onBroken={() => markBroken(picture.main.url)}
  />
{:else}
  <EventVisual name={activity.label} {categoryColor} size={layout} />
{/if}
