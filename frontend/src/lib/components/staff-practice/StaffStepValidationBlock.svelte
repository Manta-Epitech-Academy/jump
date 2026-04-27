<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import {
    CircleCheck,
    CirclePlay,
    Send,
    ArrowRight,
    Eye,
    BookOpenCheck,
  } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { triggerConfetti } from '$lib/actions/confetti';
  import type { ActivityStep } from '$lib/server/services/progressService';

  let {
    currentStep,
    currentIndex,
    unlockedIndex,
    steps,
    selectedAnswer = $bindable(null),
    qcmFails = $bindable(0),
    showCorrections,
    onAdvance,
  }: {
    currentStep: ActivityStep;
    currentIndex: number;
    unlockedIndex: number;
    steps: ActivityStep[];
    selectedAnswer: number | null;
    qcmFails: number;
    showCorrections: boolean;
    onAdvance: () => void;
  } = $props();

  function handleQcmSubmit(e: Event) {
    e.preventDefault();
    const qcm = currentStep.validation?.qcm_data;
    if (!qcm || selectedAnswer === null) return;
    if (selectedAnswer === qcm.correct_index) {
      toast.success('Bonne réponse !');
      if (currentIndex === steps.length - 1) triggerConfetti();
      qcmFails = 0;
      onAdvance();
    } else {
      qcmFails++;
      toast.error('Mauvaise réponse. Essaie encore !');
    }
  }

  function handleReadingSubmit() {
    if (currentIndex === steps.length - 1) triggerConfetti();
    onAdvance();
  }

  function handleMantaSubmit() {
    toast.success('Étape validée (mode exercice).');
    if (currentIndex === steps.length - 1) triggerConfetti();
    onAdvance();
  }
</script>

<div
  class="rounded-2xl border-2 border-slate-100 bg-slate-50 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/50"
>
  {#if currentIndex < unlockedIndex}
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3 text-epi-teal-solid">
        <CircleCheck class="h-6 w-6" />
        <span class="font-bold uppercase">Étape validée</span>
      </div>
      {#if currentIndex < steps.length - 1}
        <Button
          variant="outline"
          class="gap-2 rounded-xl"
          onclick={() => onAdvance()}
        >
          Passer à la suite <ArrowRight class="h-4 w-4" />
        </Button>
      {/if}
    </div>
  {:else if currentStep.validation?.type === 'auto_qcm' && currentStep.validation.qcm_data}
    {@const qcm = currentStep.validation.qcm_data}
    <div class="space-y-6">
      <div class="flex items-center gap-2">
        <CirclePlay class="h-5 w-5 text-epi-blue" />
        <h3 class="font-bold text-slate-900 uppercase dark:text-white">
          Validation Requise
        </h3>
      </div>
      <p class="text-sm font-medium text-slate-700 dark:text-slate-300">
        {qcm.question}
      </p>

      <form onsubmit={handleQcmSubmit}>
        <div class="grid gap-3">
          {#each qcm.options as option, idx}
            {@const isCorrect = idx === qcm.correct_index}
            <button
              type="button"
              onclick={() => (selectedAnswer = idx)}
              class={cn(
                'flex items-center rounded-xl border-2 p-4 text-left transition-all',
                selectedAnswer === idx
                  ? 'border-epi-blue bg-blue-50 text-epi-blue shadow-md dark:bg-blue-900/20'
                  : 'border-slate-200 bg-white hover:border-epi-blue/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-epi-blue/50',
                showCorrections &&
                  isCorrect &&
                  'border-epi-teal-solid ring-2 ring-epi-teal-solid/40',
              )}
            >
              <div
                class={cn(
                  'mr-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  selectedAnswer === idx
                    ? 'border-epi-blue bg-epi-blue'
                    : 'border-slate-300 dark:border-slate-600',
                )}
              >
                {#if selectedAnswer === idx}<div
                    class="h-2 w-2 rounded-full bg-white"
                  ></div>{/if}
              </div>
              <span class="flex-1 text-sm font-medium">{option}</span>
              {#if showCorrections && isCorrect}
                <BookOpenCheck class="ml-3 h-4 w-4 text-epi-teal-solid" />
              {/if}
            </button>
          {/each}
        </div>

        {#if showCorrections}
          <p
            class="mt-4 flex items-center gap-2 text-xs font-bold text-epi-teal-solid uppercase"
          >
            <Eye class="h-3.5 w-3.5" />
            Réponse attendue : option {qcm.correct_index + 1}
          </p>
        {/if}

        <div
          class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <Button
            type="submit"
            disabled={selectedAnswer === null}
            class="w-full rounded-xl bg-epi-blue font-bold text-white hover:bg-epi-blue/90 sm:w-auto"
          >
            <Send class="mr-2 h-4 w-4" /> Valider ma réponse
          </Button>

          {#if qcmFails >= 3 && !showCorrections}
            <span
              class="animate-pulse text-center text-xs font-bold text-epi-orange uppercase sm:text-right"
            >
              Bloqué ? Active "Afficher les corrections" 👆
            </span>
          {/if}
        </div>
      </form>
    </div>
  {:else if currentStep.validation?.type === 'manual_manta'}
    <div class="flex flex-col items-center justify-center py-6 text-center">
      <div class="mb-4 rounded-full bg-orange-50 p-4 dark:bg-orange-950/30">
        <BookOpenCheck class="h-8 w-8 text-epi-orange" />
      </div>
      <h3 class="mb-2 font-bold text-slate-900 uppercase dark:text-white">
        Validation Manta
      </h3>
      <p class="mb-4 max-w-sm text-sm text-slate-500">
        En événement réel, un Manta valide cette étape après contrôle du
        travail.
      </p>

      {#if showCorrections && currentStep.validation.unlock_code}
        <div
          class="mb-4 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 font-mono text-xs text-slate-100"
        >
          <Eye class="h-3.5 w-3.5" />
          Code attendu : {currentStep.validation.unlock_code}
        </div>
      {/if}

      <Button
        onclick={handleMantaSubmit}
        class="rounded-xl bg-epi-orange font-bold text-white hover:bg-epi-orange/90"
      >
        Valider cette étape <ArrowRight class="ml-2 h-4 w-4" />
      </Button>
    </div>
  {:else}
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-bold text-slate-900 uppercase dark:text-white">
          Fin de la lecture
        </h3>
        <p class="text-sm text-slate-500">Prêt pour la suite ?</p>
      </div>
      <Button
        onclick={handleReadingSubmit}
        class="rounded-xl bg-epi-teal-solid font-bold text-white shadow-md transition-transform hover:bg-epi-teal-solid/90 active:scale-95"
      >
        Continuer <ArrowRight class="ml-2 h-4 w-4" />
      </Button>
    </div>
  {/if}
</div>
