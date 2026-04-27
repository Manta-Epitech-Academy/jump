<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { enhance } from '$app/forms';
  import { cn } from '$lib/utils';
  import {
    CircleCheck,
    CirclePlay,
    Send,
    ArrowRight,
    ShieldCheck,
    Lock,
  } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { triggerConfetti } from '$lib/actions/confetti';
  import type { ActivityStep } from '$lib/server/services/progressService';
  import type { StepsProgress } from '@prisma/client';

  let {
    currentStep,
    currentIndex,
    unlockedIndex,
    steps,
    progress,
    selectedAnswer = $bindable(null),
    qcmFails = $bindable(0),
    isValidating = $bindable(false),
  }: {
    currentStep: ActivityStep;
    currentIndex: number;
    unlockedIndex: number;
    steps: ActivityStep[];
    progress: StepsProgress;
    selectedAnswer: number | null;
    qcmFails: number;
    isValidating: boolean;
  } = $props();
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
        <form method="POST" action="?/changeStep" use:enhance>
          <input
            type="hidden"
            name="stepId"
            value={steps[currentIndex + 1].id}
          />
          <input type="hidden" name="progressId" value={progress.id} />
          <Button type="submit" variant="outline" class="gap-2 rounded-xl">
            Passer à la suite <ArrowRight class="h-4 w-4" />
          </Button>
        </form>
      {/if}
    </div>
  {:else if currentStep.validation?.type === 'auto_qcm' && currentStep.validation.qcm_data}
    <div class="space-y-6">
      <div class="flex items-center gap-2">
        <CirclePlay class="h-5 w-5 text-epi-blue" />
        <h3 class="font-bold text-slate-900 uppercase dark:text-white">
          Validation Requise
        </h3>
      </div>
      <p class="text-sm font-medium text-slate-700 dark:text-slate-300">
        {currentStep.validation.qcm_data.question}
      </p>

      <form
        action="?/validateStep"
        method="POST"
        use:enhance={() => {
          isValidating = true;
          return async ({ result, update }) => {
            isValidating = false;
            if (result.type === 'success') {
              toast.success('Bonne réponse !');
              triggerConfetti();
              qcmFails = 0;
            } else if (result.type === 'failure') {
              qcmFails++;
              toast.error(
                ((result.data as Record<string, unknown>)?.message as string) ||
                  'Mauvaise réponse.',
              );
            }
            await update({ reset: false });
          };
        }}
      >
        <input type="hidden" name="stepId" value={currentStep.id} />
        <input type="hidden" name="progressId" value={progress.id} />
        <input type="hidden" name="answerIndex" value={selectedAnswer} />

        <div class="grid gap-3">
          {#each currentStep.validation.qcm_data.options as option, idx}
            <button
              type="button"
              onclick={() => (selectedAnswer = idx)}
              class={cn(
                'flex items-center rounded-xl border-2 p-4 text-left transition-all',
                selectedAnswer === idx
                  ? 'border-epi-blue bg-blue-50 text-epi-blue shadow-md dark:bg-blue-900/20'
                  : 'border-slate-200 bg-white hover:border-epi-blue/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-epi-blue/50',
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
              <span class="text-sm font-medium">{option}</span>
            </button>
          {/each}
        </div>

        <div
          class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <Button
            type="submit"
            disabled={selectedAnswer === null || isValidating || qcmFails >= 3}
            class="w-full rounded-xl bg-epi-blue font-bold text-white hover:bg-epi-blue/90 sm:w-auto"
          >
            {#if isValidating}Vérification...{:else}<Send
                class="mr-2 h-4 w-4"
              /> Valider ma réponse{/if}
          </Button>

          {#if qcmFails >= 3}
            <span
              class="animate-pulse text-center text-xs font-bold text-epi-orange uppercase sm:text-right"
            >
              Bloqué ? Utilise le bouton "Appeler un Manta" 👇
            </span>
          {/if}
        </div>
      </form>
    </div>
  {:else if currentStep.validation?.type === 'manual_manta'}
    <div class="flex flex-col items-center justify-center py-6 text-center">
      <div class="mb-4 rounded-full bg-orange-50 p-4 dark:bg-orange-950/30">
        <Lock class="h-8 w-8 text-epi-orange" />
      </div>
      <h3 class="mb-2 font-bold text-slate-900 uppercase dark:text-white">
        Validation Manta
      </h3>
      <p class="mb-6 max-w-sm text-sm text-slate-500">
        Montre ton travail, puis clique sur "Appeler un Manta". Le Manta
        validera à distance.
      </p>

      <div
        class="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <p class="mb-3 text-[10px] font-bold text-slate-400 uppercase">
          Secours Manta (Local PIN)
        </p>
        <form
          action="?/validateStep"
          method="POST"
          use:enhance={() => {
            isValidating = true;
            return async ({ result, update }) => {
              isValidating = false;
              if (result.type === 'success') {
                toast.success('Étape débloquée localement !');
                if (currentIndex === steps.length - 1) triggerConfetti();
              } else {
                toast.error((result as any).data?.message || 'PIN Incorrect');
              }
              await update({ reset: false });
            };
          }}
          class="flex gap-2"
        >
          <input type="hidden" name="stepId" value={currentStep.id} />
          <input type="hidden" name="progressId" value={progress.id} />
          <Input
            name="pin"
            type="password"
            placeholder="••••"
            maxlength={4}
            class="h-10 text-center font-mono font-bold tracking-widest"
          />
          <Button
            type="submit"
            disabled={isValidating}
            variant="secondary"
            class="h-10 px-3"
          >
            <ShieldCheck class="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  {:else}
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-bold text-slate-900 uppercase dark:text-white">
          Fin de la lecture
        </h3>
        <p class="text-sm text-slate-500">Prêt pour la suite ?</p>
      </div>
      <form
        method="POST"
        action="?/validateStep"
        use:enhance={() => {
          return async ({ update }) => {
            await update({ reset: false });
          };
        }}
      >
        <input type="hidden" name="stepId" value={currentStep.id} />
        <input type="hidden" name="progressId" value={progress.id} />
        <Button
          type="submit"
          class="rounded-xl bg-epi-teal-solid font-bold text-white shadow-md transition-transform hover:bg-epi-teal-solid/90 active:scale-95"
        >
          Continuer <ArrowRight class="ml-2 h-4 w-4" />
        </Button>
      </form>
    </div>
  {/if}
</div>
