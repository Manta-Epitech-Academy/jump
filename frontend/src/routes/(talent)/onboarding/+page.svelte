<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { TransitionConfig } from 'svelte/transition';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onboardingSubmit } from './stepSubmit';
  import ProgressBar from './components/ProgressBar.svelte';
  import IdentityStep from './components/IdentityStep.svelte';
  import SchoolStep from './components/SchoolStep.svelte';
  import ParentsStep from './components/ParentsStep.svelte';
  import InterestsStep from './components/InterestsStep.svelte';
  import EquipmentStep from './components/EquipmentStep.svelte';
  import ProcessingStep from './components/ProcessingStep.svelte';
  import RulesStep from './components/RulesStep.svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import { Button } from '$lib/components/ui/button';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import BrandBackdrop from '$lib/components/layout/BrandBackdrop.svelte';

  function exitSlide(
    _node: Element,
    { duration = 250 }: { duration?: number } = {},
  ): TransitionConfig {
    return {
      duration,
      css: (t: number, u: number) =>
        `position: absolute; top: 0; left: 0; right: 0; opacity: ${t}; transform: translateX(${-30 * u}px);`,
    };
  }

  let { data, form } = $props();

  const STEP_INFO: Record<
    string,
    { index: number; display: number; title: string }
  > = {
    identity: { index: 1, display: 1, title: 'Qui es-tu ?' },
    school: { index: 2, display: 1, title: 'De quel lycée viens-tu ?' },
    parents: { index: 3, display: 1, title: "Contacts d'urgence" },
    interests: { index: 4, display: 2, title: "Centres d'intérêt" },
    equipment: { index: 5, display: 3, title: 'Ton matériel' },
    processing: { index: 6, display: 4, title: 'Génération...' },
    rules: { index: 7, display: 4, title: 'Dernière étape' },
  };
  const TOTAL_INTERNAL = 7;
  const TOTAL_DISPLAY = 4;

  let goBackForm: HTMLFormElement;
  let scrollContainer: HTMLElement | undefined = $state();

  $effect(() => {
    data.step;
    scrollContainer?.scrollTo(0, 0);
  });

  const stepIndex = $derived(STEP_INFO[data.step]?.index ?? 1);
  const displayStep = $derived(STEP_INFO[data.step]?.display ?? 1);
  const progress = $derived(
    Math.round(((stepIndex - 0.5) / TOTAL_INTERNAL) * 100),
  );
  const pageTitle = $derived(STEP_INFO[data.step]?.title ?? 'Onboarding');
  const showBack = $derived(
    data.step !== 'identity' && data.step !== 'processing',
  );

  function goBackServer() {
    goBackForm.requestSubmit();
  }
</script>

<svelte:head>
  <title>{pageTitle} — Bienvenue</title>
</svelte:head>

<div
  class="relative flex h-dvh w-full flex-col overflow-hidden bg-muted transition-colors duration-320"
>
  <BrandBackdrop />

  <!-- Hidden form for server-side go-back -->
  <form
    bind:this={goBackForm}
    method="POST"
    action="?/goBack"
    use:enhance={onboardingSubmit()}
    class="hidden"
  ></form>

  <ProgressBar {progress} />

  <!-- ═══ Header sticky ═══ -->
  <header class="relative z-10 shrink-0 border-b border-border/50 bg-muted">
    <div
      class="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3"
    >
      <!-- Left: logo (always visible, fixed position) -->
      <a href={resolve('/')} aria-label="Accueil">
        <EpitechLogo class="h-7 w-auto" />
      </a>

      <!-- Right: back button + step counter -->
      <div class="flex items-center gap-3">
        {#if showBack}
          <Button
            variant="ghost"
            onclick={goBackServer}
            class="h-auto gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground-secondary"
          >
            <ArrowLeft class="h-3.5 w-3.5" />
            Retour
          </Button>
        {/if}
        <span class="text-xs font-semibold text-muted-foreground">
          {displayStep}/{TOTAL_DISPLAY}
        </span>
      </div>
    </div>
  </header>

  <!-- ═══ Scrollable content ═══ -->
  <main
    bind:this={scrollContainer}
    class="relative z-10 flex-1 overflow-y-auto"
  >
    <div class="mx-auto w-full max-w-lg px-4 py-8">
      <div class="relative">
        {#key data.step}
          <div
            class="w-full"
            in:fly|local={{ x: 30, duration: 250, delay: 180 }}
            out:exitSlide|local={{ duration: 180 }}
          >
            {#if data.step === 'identity'}
              <IdentityStep
                profile={data.profile}
                errors={form?.step === 'identity' ? form?.errors : undefined}
              />
            {:else if data.step === 'school'}
              <SchoolStep
                profile={data.profile}
                errors={form?.step === 'school' ? form?.errors : undefined}
              />
            {:else if data.step === 'parents'}
              <ParentsStep
                profile={data.profile}
                errors={form?.step === 'parents' ? form?.errors : undefined}
              />
            {:else if data.step === 'interests'}
              <InterestsStep
                techInterests={data.techInterests ?? []}
                generalInterests={data.generalInterests ?? []}
                selectedTechIds={data.selectedTechIds ?? []}
                selectedGeneralIds={data.selectedGeneralIds ?? []}
                freeText={data.freeText ?? ''}
                shuffleSeed={data.shuffleSeed ?? ''}
                error={form?.step === 'interests' ? form?.error : undefined}
              />
            {:else if data.step === 'equipment'}
              <EquipmentStep
                setupDescription={data.setupDescription ?? ''}
                error={form?.step === 'equipment' ? form?.error : undefined}
              />
            {:else if data.step === 'processing'}
              <ProcessingStep />
            {:else if data.step === 'rules'}
              <RulesStep
                charterAccepted={data.charterAccepted ?? false}
                welcomeBonusGranted={data.welcomeBonusGranted ?? false}
                error={form?.step === 'rules' ? form?.error : undefined}
              />
            {/if}
          </div>
        {/key}
      </div>
    </div>
  </main>

  <!-- ═══ Footer ═══ -->
  <TalentFooter class="relative z-10 shrink-0" />
</div>
