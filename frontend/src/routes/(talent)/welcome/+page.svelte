<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { onMount } from 'svelte';
  import { track, daysBetween, secondsBetween } from '$lib/analytics';

  let { data }: { data: PageData } = $props();
  const seenAt = Date.now();

  onMount(() => {
    track('welcome_seen', {
      daysSinceInvite: daysBetween(data.talentCreatedAt),
    });
  });
</script>

<div
  class="relative flex min-h-dvh w-full flex-col overflow-hidden bg-slate-50 transition-colors duration-500 dark:bg-slate-950"
>
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/10 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/10 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
  ></div>

  <!-- Header — logo lives in the top bar, matching the onboarding pages -->
  <header
    class="relative z-10 shrink-0 border-b border-slate-300/50 bg-slate-100/80 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/80"
  >
    <div class="mx-auto flex w-full max-w-lg items-center px-4 py-3">
      <a href={resolve('/')} aria-label="Accueil">
        <EpitechLogo class="h-7 w-auto" />
      </a>
    </div>
  </header>

  <!-- Content centered -->
  <div class="relative z-10 flex flex-1 items-center justify-center p-4">
    <div class="w-full max-w-lg">
      <div class="mb-6 text-center">
        <h1
          class="font-heading text-2xl tracking-wider text-epi-blue uppercase dark:text-epi-blue"
        >
          Bienvenue, {data.prenom}.
        </h1>
      </div>

      <div
        class="space-y-4 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300"
      >
        <p>
          Tu viens de poser un pied chez <strong>Epitech</strong>. On fait
          connaissance ? Quelques minutes sur <strong>Jump</strong>, et tout
          sera prêt.
        </p>
      </div>

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
            class="h-auto rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
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
