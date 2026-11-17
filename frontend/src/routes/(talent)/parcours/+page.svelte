<script lang="ts">
  import type { PageData } from './$types';
  import { enter, stagger } from '$lib/motion';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import LevelCard from '$lib/components/talent/LevelCard.svelte';
  import LevelLadderHelp from '$lib/components/talent/LevelLadderHelp.svelte';
  import ParcoursTimeline from '$lib/components/talent/ParcoursTimeline.svelte';

  // « Mon parcours » after the 2027 mockup (#445): the level, then the journey
  // event by event. The badge collection (#448) will sit beside the journey.
  let { data }: { data: PageData } = $props();

  const xp = $derived(data.talent?.xp ?? 0);
</script>

<svelte:head>
  <title>Mon parcours</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
  <TalentPageHeader title="Mon parcours" backLabel="Retour à l'accueil">
    {#snippet actions()}
      <LevelLadderHelp {xp} />
    {/snippet}
  </TalentPageHeader>

  <div
    class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:py-8 md:px-8"
  >
    <div in:enter={{ y: -12 }}>
      <LevelCard {xp} />
    </div>
    <div in:enter={{ delay: stagger(1) }}>
      <ParcoursTimeline parcours={data.parcours} invitation={data.invitation} />
    </div>
  </div>

  <TalentFooter />
</div>
