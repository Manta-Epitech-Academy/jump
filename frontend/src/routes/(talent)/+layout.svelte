<script lang="ts">
  import '../../routes/layout.css';
  import { untrack } from 'svelte';
  import { BitsConfig } from 'bits-ui';
  import TalentImpersonationBanner from '#lib/components/TalentImpersonationBanner.svelte';
  import Crisp from '#lib/components/Crisp.svelte';
  import {
    MascotController,
    provideMascot,
  } from '#lib/components/mascot/mascotController.svelte.ts';
  import { mascotLookOf } from '#lib/domain/mascot.ts';

  let { data, children } = $props();

  // The talent's EpiDuck, made once per talent for the layout so he outlives
  // the page (the header that draws him remounts on every navigation). Keyed on
  // the talent alone: the layout's data reloads after every settings save, and
  // a duck rebuilt then would forget he was mid-pond. Signing in without
  // leaving the layout makes him; the sign-in page draws no header anyway.
  let talentId = $derived(data.talent?.id ?? null);
  const mascot = $derived.by(() => {
    if (!talentId) return null;
    const id = talentId;
    return untrack(() => {
      const first = data.mascot;
      if (!first || !data.talent) return null;
      return new MascotController({
        talentId: id,
        asleep: data.talent.mascotAsleepAt !== null,
        voice: () => data.mascot?.voice ?? first.voice,
        tokens: () => ({
          prenom: data.talent?.prenom ?? '',
          canard: data.talent ? mascotLookOf(data.talent).name : '',
        }),
        greeting: first.greeting,
        today: first.today,
      });
    });
  });
  provideMascot(() => mascot);
</script>

<!-- The "Friendly Tech" Camper Wrapper. It carries the talent skin (radius,
     elevation, focus ring), so every popover, dialog and select opens inside
     it rather than at the end of <body>, where it would fall back to the staff
     skin: a portal leaves the DOM tree, and the skin's tokens with it. -->
<div
  class="camper-layout min-h-dvh bg-background text-foreground selection:bg-epi-tech selection:text-black dark:selection:bg-epi-tech"
>
  <BitsConfig defaultPortalTo=".camper-layout">
    <TalentImpersonationBanner />
    {@render children()}
  </BitsConfig>
</div>

<!-- Live-chat widget, self-gated to the login + onboarding surfaces (see Crisp.svelte / supportSurfaces). No-op unless PUBLIC_CRISP_WEBSITE_ID is set. -->
<Crisp />
