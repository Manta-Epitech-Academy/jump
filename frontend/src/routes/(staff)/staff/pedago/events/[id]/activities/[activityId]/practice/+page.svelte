<script lang="ts">
  import type { PageData } from './$types';
  import { marked } from 'marked';
  import { fade, fly } from 'svelte/transition';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import {
    ArrowLeft,
    Map as MapIcon,
    Trophy,
    RotateCcw,
    Eye,
    FlaskConical,
  } from '@lucide/svelte';
  import type { ActivityStep } from '$lib/server/services/progressService';

  import StaffRoadmapSidebar from '$lib/components/staff-practice/StaffRoadmapSidebar.svelte';
  import StaffStepValidationBlock from '$lib/components/staff-practice/StaffStepValidationBlock.svelte';

  let { data }: { data: PageData } = $props();

  let activity = $derived(data.activity);
  let event = $derived(data.event);
  let steps = $derived<ActivityStep[]>(data.steps);

  let currentIndex = $state(0);
  let unlockedIndex = $state(0);
  let selectedAnswer = $state<number | null>(null);
  let qcmFails = $state(0);
  let showCorrections = $state(false);
  let showRoadmapMobile = $state(false);

  let currentStep = $derived<ActivityStep | null>(steps[currentIndex] ?? null);
  let isCompleted = $derived(unlockedIndex >= steps.length);

  let parsedHtml = $derived(
    currentStep ? (marked.parse(currentStep.content_markdown) as string) : '',
  );

  $effect(() => {
    if (currentStep) {
      currentStep.id;
      selectedAnswer = null;
      qcmFails = 0;
    }
  });

  function selectStep(stepId: string) {
    const i = steps.findIndex((s) => s.id === stepId);
    if (i === -1 || i > unlockedIndex) return;
    currentIndex = i;
  }

  function advance() {
    const next = currentIndex + 1;
    if (next > unlockedIndex) unlockedIndex = next;
    if (next < steps.length) currentIndex = next;
    else currentIndex = steps.length - 1;
  }

  function restart() {
    currentIndex = 0;
    unlockedIndex = 0;
    selectedAnswer = null;
    qcmFails = 0;
  }

  let backHref = $derived(resolve(`/staff/pedago/events/${event.id}/planning`));
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
        href={backHref}
        class="h-9 w-9 shrink-0"
      >
        <ArrowLeft class="h-4 w-4" />
      </Button>
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex min-w-0 flex-col">
          <span
            class="truncate text-[10px] font-bold tracking-wider text-slate-400 uppercase"
          >
            {event.titre}
          </span>
          <h1 class="line-clamp-1 font-heading text-lg tracking-wide uppercase">
            {activity.nom}<span class="text-epi-teal">_</span>
          </h1>
        </div>
        <Badge
          variant="outline"
          class="shrink-0 gap-1 border-epi-orange text-[10px] text-epi-orange"
        >
          <FlaskConical class="h-3 w-3" /> Entraînement staff
        </Badge>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        class="md:hidden"
        onclick={() => (showRoadmapMobile = !showRoadmapMobile)}
      >
        <MapIcon class="mr-2 h-4 w-4" /> Carte
      </Button>

      <div
        class="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 md:flex dark:border-slate-800 dark:bg-slate-950"
      >
        <Eye class="h-3.5 w-3.5 text-slate-500" />
        <Label
          for="show-corrections"
          class="cursor-pointer text-xs font-bold text-slate-600 uppercase dark:text-slate-300"
        >
          Corrections
        </Label>
        <Switch id="show-corrections" bind:checked={showCorrections} />
      </div>

      <div
        class="hidden items-center gap-3 rounded-full bg-slate-100 px-3 py-1.5 md:flex dark:bg-slate-800"
      >
        <div
          class="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <div
            class="h-full bg-epi-teal-solid transition-all duration-500"
            style="width: {(Math.min(unlockedIndex, steps.length) /
              Math.max(steps.length, 1)) *
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
    <StaffRoadmapSidebar
      {steps}
      {currentIndex}
      {unlockedIndex}
      bind:showRoadmapMobile
      onSelect={selectStep}
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
      {#if isCompleted}
        <div
          class="flex h-full flex-col items-center justify-center p-8 text-center"
          in:fly={{ y: 20, duration: 500 }}
        >
          <div class="mb-6 rounded-full bg-epi-teal-solid/10 p-6">
            <Trophy class="h-16 w-16 text-epi-teal-solid" />
          </div>
          <h2
            class="mb-2 font-heading text-4xl text-slate-900 uppercase dark:text-white"
          >
            Entraînement terminé !
          </h2>
          <p class="mb-8 max-w-md text-sm text-slate-500">
            Rien n'a été enregistré en base. Tu peux recommencer ou revenir au
            planning.
          </p>
          <div class="flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              onclick={restart}
              class="rounded-xl bg-epi-blue font-bold text-white shadow-lg hover:bg-epi-blue/90"
            >
              <RotateCcw class="mr-2 h-5 w-5" /> Recommencer
            </Button>
            <Button
              size="lg"
              variant="outline"
              href={backHref}
              class="rounded-xl"
            >
              Retour au planning
            </Button>
          </div>
        </div>
      {:else if currentStep}
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
              class="markdown-content prose max-w-none text-base leading-relaxed prose-slate dark:prose-invert"
            >
              {@html parsedHtml}
            </div>

            <hr class="my-10 border-slate-200 dark:border-slate-800" />

            <StaffStepValidationBlock
              {currentStep}
              {currentIndex}
              {unlockedIndex}
              {steps}
              {showCorrections}
              bind:selectedAnswer
              bind:qcmFails
              onAdvance={advance}
            />

            <div class="mt-6 flex items-center justify-between md:hidden">
              <div class="flex items-center gap-2">
                <Eye class="h-3.5 w-3.5 text-slate-500" />
                <Label
                  for="show-corrections-mobile"
                  class="cursor-pointer text-xs font-bold text-slate-600 uppercase dark:text-slate-300"
                >
                  Corrections
                </Label>
                <Switch
                  id="show-corrections-mobile"
                  bind:checked={showCorrections}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onclick={restart}
                class="text-xs text-muted-foreground"
              >
                <RotateCcw class="mr-1 h-3 w-3" /> Recommencer
              </Button>
            </div>
          </div>
        {/key}
      {/if}
    </main>
  </div>
</div>
