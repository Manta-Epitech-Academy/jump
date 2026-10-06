<script lang="ts">
  import ActivityHero from './ActivityHero.svelte';
  import HighlightHero from './HighlightHero.svelte';
  import type { HomeHero } from '$lib/domain/talentHome';

  // The blue zone at the head of a talent's home: the one place where Jump
  // says what to do now. What it holds is decided server-side by
  // `pickHomeHero`; this only picks the shape that renders it.
  let { hero }: { hero: HomeHero } = $props();
</script>

{#if hero.kind === 'activity'}
  <ActivityHero activities={hero.activities} context="today" next={hero.next} />
{:else if hero.kind === 'highlight'}
  <HighlightHero highlight={hero.highlight} />
{:else}
  <ActivityHero activities={[hero.activity]} context="continue" />
{/if}
