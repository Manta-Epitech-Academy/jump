<script lang="ts">
  import EnrolledHero from './EnrolledHero.svelte';
  import InvitationHero from './InvitationHero.svelte';
  import LiveHero from './LiveHero.svelte';
  import type { HomeHero } from '$lib/domain/talentHome';

  // The blue zone at the head of a talent's home: the one place where Jump
  // says what to do now, and what the talent is living reflected back (#501).
  // What it holds is decided server-side by `pickHomeHero`; this only picks
  // the shape that renders it.
  let { hero }: { hero: HomeHero } = $props();
</script>

{#if hero.kind === 'live' || hero.kind === 'continue'}
  <LiveHero {hero} />
{:else if hero.kind === 'enrolled'}
  <EnrolledHero {hero} />
{:else}
  <InvitationHero {hero} />
{/if}
