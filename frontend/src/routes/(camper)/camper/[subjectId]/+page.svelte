<script lang="ts">
  import type { PageData } from './$types';
  import { marked } from 'marked';
  import { fade, fly } from 'svelte/transition';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import {
    ArrowLeft,
    Map as MapIcon,
    FolderOpen,
    Trophy,
  } from '@lucide/svelte';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { enhance } from '$app/forms';
  import { triggerConfetti } from '$lib/actions/confetti';
  import { cn } from '$lib/utils';

  import RoadmapSidebar from './components/RoadmapSidebar.svelte';
  import StepValidationBlock from './components/StepValidationBlock.svelte';
  import PortfolioDrawer from './components/PortfolioDrawer.svelte';
  import MantaSignalButton from './components/MantaSignalButton.svelte';

  let { data }: { data: PageData } = $props();

  let participation = $derived(data.participation);
  let progress = $derived(data.progress);
  let steps = $derived(data.content.steps || []);
  let portfolioItems = $derived(data.portfolioItems || []);

  let currentIndex = $derived(
    steps.findIndex((s) => s.id === progress.currentStepId),
  );
  let unlockedIndex = $derived(
    progress.unlockedStepId === 'COMPLETED'
      ? steps.length
      : steps.findIndex((s) => s.id === progress.unlockedStepId),
  );

  let currentStep = $derived(steps[currentIndex] || steps[0]);
  let isCompleted = $derived(progress.status === 'completed');
  let parsedHtml = $derived(
    marked.parse(currentStep.content_markdown) as string,
  );

  let selectedAnswer = $state<number | null>(null);
  let qcmFails = $state(0);
  let isValidating = $state(false);

  let showRoadmapMobile = $state(false);
  let showPortfolio = $state(false);

  // Feedback State
  let feedbackRating = $state<number | null>(null);
  let feedbackText = $state('');
  let isSubmittingFeedback = $state(false);

  $effect(() => {
    currentStep.id;
    selectedAnswer = null;
    qcmFails = 0;
  });

  let progressId = $derived(data.progress.id);

  // TODO: implement SSE or polling for live staff unlock notifications and status changes
</script>

<div
  class="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950"
>
  <header
    class="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-6 dark:border-slate-800 dark:bg-slate-900"
  >
    <div class="flex items-center gap-4">
      <Button
        variant="ghost"
        size="icon"
        href={resolve('/camper')}
        class="h-9 w-9 shrink-0"
      >
        <ArrowLeft class="h-4 w-4" />
      </Button>
      <div>
        <h1 class="line-clamp-1 font-heading text-lg tracking-wide uppercase">
          {data.subject.nom}<span class="text-epi-teal">_</span>
        </h1>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        class="md:hidden"
        onclick={() => (showRoadmapMobile = !showRoadmapMobile)}
      >
        <MapIcon class="mr-2 h-4 w-4" /> Carte
      </Button>

      <Button
        variant="secondary"
        size="sm"
        class="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
        onclick={() => (showPortfolio = true)}
      >
        <FolderOpen class="mr-2 h-4 w-4" />
        <span class="hidden sm:inline">Mon Portfolio</span>
        {#if portfolioItems.length > 0}
          <Badge
            variant="default"
            class="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 p-0 text-[10px]"
            >{portfolioItems.length}</Badge
          >
        {/if}
      </Button>

      <div
        class="hidden items-center gap-3 rounded-full bg-slate-100 px-3 py-1.5 md:flex dark:bg-slate-800"
      >
        <div
          class="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <div
            class="h-full bg-epi-teal transition-all duration-500"
            style="width: {(Math.min(unlockedIndex, steps.length) /
              steps.length) *
              100}%"
          ></div>
        </div>
        <span class="text-xs font-bold text-slate-500 uppercase"
          >{Math.min(unlockedIndex, steps.length)} / {steps.length}</span
        >
      </div>
    </div>
  </header>

  <div class="relative flex flex-1 overflow-hidden">
    <RoadmapSidebar
      {steps}
      {progress}
      {currentIndex}
      {unlockedIndex}
      bind:showRoadmapMobile
    />

    {#if showRoadmapMobile}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute inset-0 z-10 bg-slate-900/50 backdrop-blur-sm md:hidden"
        transition:fade={{ duration: 200 }}
        onclick={() => (showRoadmapMobile = false)}
      ></div>
    {/if}

    <main class="relative flex-1 overflow-y-auto bg-white dark:bg-slate-900">
      {#if isCompleted && currentIndex === steps.length - 1}
        <div
          class="flex h-full flex-col items-center justify-center p-8 text-center"
          in:fly={{ y: 20, duration: 500 }}
        >
          <div class="mb-6 rounded-full bg-teal-50 p-6 dark:bg-teal-950/30">
            <Trophy class="h-16 w-16 text-epi-teal" />
          </div>
          <h2
            class="mb-2 font-heading text-4xl text-slate-900 uppercase dark:text-white"
          >
            Sujet Terminé !
          </h2>

          {#if participation.camperRating}
            <p class="mb-8 max-w-md text-lg text-slate-500">
              Merci pour ton retour ! Ton feedback aide les Mantas à améliorer
              les ateliers.
            </p>
            <div class="flex flex-col gap-4 sm:flex-row">
              <Button
                size="lg"
                href={resolve('/camper')}
                class="rounded-xl bg-epi-blue font-bold text-white shadow-lg hover:bg-epi-blue/90"
              >
                Retourner au Cockpit
              </Button>
              <Button
                size="lg"
                variant="outline"
                class="rounded-xl border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
                onclick={() => (showPortfolio = true)}
              >
                <FolderOpen class="mr-2 h-5 w-5" /> Gérer mon Portfolio
              </Button>
            </div>
          {:else}
            <p class="mb-6 max-w-md text-sm text-slate-500">
              Excellent travail. Avant de partir, dis-nous ce que tu as pensé de
              cette mission :
            </p>
            <form
              method="POST"
              action="?/submitFeedback"
              use:enhance={() => {
                isSubmittingFeedback = true;
                return async ({ result, update }) => {
                  isSubmittingFeedback = false;
                  if (result.type === 'success') {
                    toast.success('Feedback envoyé !');
                  } else {
                    toast.error("Erreur lors de l'envoi du feedback");
                  }
                  await update();
                };
              }}
              class="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <input
                type="hidden"
                name="participationId"
                value={participation.id}
              />
              <input type="hidden" name="rating" value={feedbackRating ?? ''} />

              <div class="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onclick={() => (feedbackRating = 1)}
                  class={cn(
                    'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all',
                    feedbackRating === 1
                      ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/20'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950',
                  )}
                >
                  <span class="text-3xl">🤯</span>
                  <span class="text-xs font-bold uppercase">Difficile</span>
                </button>
                <button
                  type="button"
                  onclick={() => (feedbackRating = 2)}
                  class={cn(
                    'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all',
                    feedbackRating === 2
                      ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/20'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950',
                  )}
                >
                  <span class="text-3xl">💪</span>
                  <span class="text-xs font-bold uppercase">Moyen</span>
                </button>
                <button
                  type="button"
                  onclick={() => (feedbackRating = 3)}
                  class={cn(
                    'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all',
                    feedbackRating === 3
                      ? 'border-teal-400 bg-teal-50 text-teal-700 dark:bg-teal-900/20'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950',
                  )}
                >
                  <span class="text-3xl">🚀</span>
                  <span class="text-xs font-bold uppercase">Facile</span>
                </button>
              </div>

              <div class="space-y-2 text-left">
                <label
                  for="feedback"
                  class="text-xs font-bold text-slate-500 uppercase"
                  >Un commentaire pour les Mantas ? (Optionnel)</label
                >
                <textarea
                  id="feedback"
                  name="feedback"
                  bind:value={feedbackText}
                  placeholder="Ce qui était cool, ce qui était dur..."
                  class="min-h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-epi-blue focus:ring-1 focus:ring-epi-blue dark:border-slate-800 dark:bg-slate-950 dark:focus:border-epi-blue dark:focus:ring-epi-blue"
                ></textarea>
              </div>

              <Button
                type="submit"
                disabled={!feedbackRating || isSubmittingFeedback}
                class="w-full rounded-xl bg-epi-blue font-bold text-white hover:bg-epi-blue/90"
              >
                {#if isSubmittingFeedback}Envoi en cours...{:else}Envoyer mon
                  retour{/if}
              </Button>
            </form>
          {/if}
        </div>
      {:else}
        {#key currentStep.id}
          <div
            class="mx-auto max-w-3xl px-6 py-8 pb-32 md:py-12"
            in:fly={{ y: 15, duration: 300, delay: 100 }}
          >
            <Badge
              variant="outline"
              class="mb-4 border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950"
              >Étape {currentIndex + 1}</Badge
            >
            <h2
              class="mb-8 font-heading text-3xl tracking-wide text-slate-900 uppercase dark:text-white"
            >
              {currentStep.title}
            </h2>

            <div
              class="markdown-content prose prose-slate dark:prose-invert max-w-none text-base leading-relaxed"
            >
              {@html parsedHtml}
            </div>

            <hr class="my-10 border-slate-200 dark:border-slate-800" />

            <StepValidationBlock
              {currentStep}
              {currentIndex}
              {unlockedIndex}
              {steps}
              {progress}
              bind:selectedAnswer
              bind:qcmFails
              bind:isValidating
            />
          </div>
        {/key}
      {/if}
    </main>

    <MantaSignalButton {progress} {isCompleted} />
  </div>

  <PortfolioDrawer bind:showPortfolio {portfolioItems} eventId={data.eventId} />
</div>
