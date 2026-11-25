<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { Button } from '#lib/components/ui/button/index.ts';
  import EpitechLogo from '#lib/components/layout/EpitechLogo.svelte';
  import TalentFooter from '#lib/components/talent/TalentFooter.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { onMount } from 'svelte';
  import { track, daysBetween, secondsBetween } from '#lib/analytics.ts';
  import BrandBackdrop from '#lib/components/layout/BrandBackdrop.svelte';
  import MascotCameo from '#lib/components/mascot/MascotCameo.svelte';

  let { data }: { data: PageData } = $props();
  const seenAt = Date.now();

  onMount(() => {
    track('welcome_seen', {
      daysSinceInvite: daysBetween(data.talentCreatedAt),
    });
  });
</script>

<div
  class="relative flex min-h-dvh w-full flex-col overflow-hidden bg-background transition-colors duration-320"
>
  <BrandBackdrop />

  <!-- Header: logo lives in the top bar, matching the onboarding pages -->
  <header class="relative z-10 shrink-0 border-b border-border/50 bg-muted">
    <div class="mx-auto flex w-full max-w-lg items-center px-4 py-3">
      <a href={resolve('')} aria-label="Accueil">
        <EpitechLogo class="h-7 w-auto" />
      </a>
    </div>
  </header>

  <!-- Content centered -->
  <div class="relative z-10 flex flex-1 items-center justify-center p-4">
    <div class="w-full max-w-lg">
      <!-- The first meeting (#540): his duck comes out of the water and says
           the welcome himself, title and all, before the talent has given
           him a name. The page has no text of its own beside his: what it
           used to say is his first line now, written by the PO. Asleep or
           silent, the title stays. -->
      <MascotCameo
        cue={{ moment: 'firstMeeting' }}
        atlas="stage"
        entrance="emerge"
        class="h-36 w-24 sm:h-44 sm:w-29"
      >
        {@render title()}
        {#snippet fallback()}
          <div class="text-center">{@render title()}</div>
        {/snippet}
      </MascotCameo>

      {#snippet title()}
        <h1 class="font-heading text-display-m text-primary">
          Bienvenue, {data.prenom}.
        </h1>
      {/snippet}

      <div class="mt-8 flex justify-center">
        <form
          method="POST"
          action="?/markSeen"
          use:enhance={() => {
            return async ({ update }) => {
              track('welcome_dismissed', {
                daysSinceInvite: daysBetween(data.talentCreatedAt),
                secondsOnPage: secondsBetween(seenAt),
              });
              await update();
            };
          }}
        >
          <Button
            type="submit"
            class="h-auto rounded-xl bg-epi-tech px-6 py-3 text-black shadow-raised transition-ui duration-200 hover:bg-epi-tech hover:brightness-110"
          >
            On y va
            <ArrowRight class="ml-2 h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <TalentFooter class="relative z-10" />
</div>
