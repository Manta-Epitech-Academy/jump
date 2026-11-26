<script lang="ts">
  import type { PageData } from './$types';
  import { enter, stagger } from '#lib/motion/index.ts';
  import TalentPageHeader from '#lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '#lib/components/talent/TalentFooter.svelte';
  import LevelCard from '#lib/components/talent/LevelCard.svelte';
  import ParcoursTimeline from '#lib/components/talent/ParcoursTimeline.svelte';
  import EpidexCard from '#lib/components/talent/EpidexCard.svelte';

  // « Mon parcours » after the 2027 mockup (#445): the level, then the badge
  // collection (#551) and the journey event by event, side by side where
  // there is room for both, the collection first, as the mockup lays them.
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
    <div class="flex flex-wrap items-start gap-6">
      {#if data.collection.badges.length > 0}
        <div class="min-w-0 flex-[3_1_400px]" in:enter={{ delay: stagger(1) }}>
          <EpidexCard collection={data.collection} />
        </div>
      {/if}
      <div class="min-w-0 flex-[2_1_280px]" in:enter={{ delay: stagger(2) }}>
        <ParcoursTimeline
          parcours={data.parcours}
          invitation={data.invitation}
        />
      </div>
    </div>
  </div>

  <TalentFooter />
</div>
