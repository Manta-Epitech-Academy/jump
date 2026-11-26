<script lang="ts">
  import type { PageData } from './$types';
  import { enter, stagger } from '#lib/motion/index.ts';
  import TalentPageHeader from '#lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '#lib/components/talent/TalentFooter.svelte';
  import LevelCard from '#lib/components/talent/LevelCard.svelte';
  import ParcoursTimeline from '#lib/components/talent/ParcoursTimeline.svelte';
  import EpidexCard from '#lib/components/talent/EpidexCard.svelte';

  // « Mon parcours » after the 2027 mockup (#445): the level, the badge
  // collection (#551), then the journey event by event. One under the other,
  // where the mockup sets the last two side by side: its journey is a list of
  // names and XP that fits a third of the page, ours carries each activity
  // still to walk as a card with its cover (#445), which a third of the page
  // squeezed into a column three times taller than the collection beside it.
  // A Jump with no badge yet shows the journey alone: an empty collection
  // would only say « 0 / 0 ».
  let { data }: { data: PageData } = $props();

  const xp = $derived(data.talent?.xp ?? 0);
</script>

<svelte:head>
  <title>Mon parcours</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
  <TalentPageHeader title="Mon parcours" backLabel="Retour à l'accueil" />

  <div
    class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:py-8 md:px-8"
  >
    <div in:enter={{ y: -12 }}>
      <LevelCard {xp} />
    </div>
    {#if data.collection.badges.length > 0}
      <div in:enter={{ delay: stagger(1) }}>
        <EpidexCard collection={data.collection} />
      </div>
    {/if}
    <div in:enter={{ delay: stagger(2) }}>
      <ParcoursTimeline parcours={data.parcours} invitation={data.invitation} />
    </div>
  </div>

  <TalentFooter />
</div>
