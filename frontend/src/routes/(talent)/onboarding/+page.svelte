<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import ProgressBar from './components/ProgressBar.svelte';
  import InterstitialMessage from './components/InterstitialMessage.svelte';
  import NameStep from './components/NameStep.svelte';
  import EmailStep from './components/EmailStep.svelte';
  import ParentStep from './components/ParentStep.svelte';
  import PhonesStep from './components/PhonesStep.svelte';
  import LyceeStep from './components/LyceeStep.svelte';
  import InterestsStep from './components/InterestsStep.svelte';
  import RulesStep from './components/RulesStep.svelte';

  let { data, form } = $props();

  // Server step -> first micro-step mapping
  const SERVER_STEP_TO_MICRO: Record<string, number> = {
    'info-validation': 1,
    lycee: 5,
    'interests-tech': 6,
    'interests-general': 7,
    rules: 8,
  };

  const TOTAL_MICRO_STEPS = 8;

  let microStep = $state(SERVER_STEP_TO_MICRO[data.step] ?? 1);
  let lastServerStep = $state(data.step);
  let interstitial = $state<string | null>(null);
  let interstitialDone: (() => void) | null = $state(null);

  // Accumulated info fields for micro-steps 1-4
  let infoFields = $state({
    nom: data.profile?.nom ?? '',
    prenom: data.profile?.prenom ?? '',
    email: data.profile?.email ?? '',
    parentNom: data.profile?.parentNom ?? '',
    parentPrenom: data.profile?.parentPrenom ?? '',
    parentEmail: data.profile?.parentEmail ?? '',
    parentPhone: data.profile?.parentPhone ?? '',
    phone: data.profile?.phone ?? '',
  });

  // Sync microStep when the server step changes (after form POST + redirect)
  $effect(() => {
    if (data.step !== lastServerStep) {
      lastServerStep = data.step;
      microStep = SERVER_STEP_TO_MICRO[data.step] ?? 1;
    }
  });

  // Auto-skip the recap step (server still requires it, but we don't show it)
  $effect(() => {
    if (data.step === 'interests-recap') {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '?/confirmRecap';
      document.body.appendChild(form);
      form.submit();
    }
  });

  // If server returned validation errors on validateInfo, jump to PhonesStep (micro 4)
  $effect(() => {
    if (form?.errors && data.step === 'info-validation') {
      microStep = 4;
    }
  });

  // Progress: 10% base + ~10% per step
  const progress = $derived(
    Math.round((microStep / TOTAL_MICRO_STEPS) * 90 + 10),
  );

  // Page title per micro-step
  const TITLES: Record<number, string> = {
    1: 'Tes infos',
    2: 'Ton email',
    3: 'Ton parent',
    4: 'Téléphones',
    5: 'Ton lycée',
    6: 'Informatique',
    7: "Centres d'intérêt",
    8: 'Règlement',
  };
  const pageTitle = $derived(TITLES[microStep] ?? 'Onboarding');

  // Interstitial messages after specific steps
  const INTERSTITIALS: Record<number, string> = {
    4: "L'administratif c'est fini !",
    7: 'On y est presque',
  };

  function advanceMicroStep(nextStep: number) {
    const message = INTERSTITIALS[microStep];
    if (message) {
      interstitial = message;
      interstitialDone = () => {
        interstitial = null;
        interstitialDone = null;
        microStep = nextStep;
      };
    } else {
      microStep = nextStep;
    }
  }
</script>

<svelte:head>
  <title>{pageTitle} — Bienvenue</title>
</svelte:head>

<ProgressBar {progress} />

<div
  class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
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

  <div class="z-10 w-full max-w-lg">
    {#if interstitial && interstitialDone}
      <InterstitialMessage message={interstitial} ondone={interstitialDone} />
    {:else}
      <div class="relative overflow-hidden">
        {#key microStep}
          <div
            class="w-full"
            in:fly|local={{ x: 30, duration: 300, delay: 280 }}
            out:fly|local={{
              x: -30,
              duration: 250,
              css: (t, u) =>
                `position: absolute; top: 0; left: 0; right: 0; opacity: ${t};  transform: translateX(${-30 * u}px);`,
            }}
          >
            {#if microStep === 1}
              <NameStep
                prenom={infoFields.prenom}
                nom={infoFields.nom}
                onvalidate={(d) => {
                  infoFields.prenom = d.prenom;
                  infoFields.nom = d.nom;
                  advanceMicroStep(2);
                }}
              />
            {:else if microStep === 2}
              <EmailStep
                email={infoFields.email}
                onvalidate={(d) => {
                  infoFields.email = d.email;
                  advanceMicroStep(3);
                }}
              />
            {:else if microStep === 3}
              <ParentStep
                parentNom={infoFields.parentNom}
                parentPrenom={infoFields.parentPrenom}
                parentEmail={infoFields.parentEmail}
                onvalidate={(d) => {
                  infoFields.parentNom = d.parentNom;
                  infoFields.parentPrenom = d.parentPrenom;
                  infoFields.parentEmail = d.parentEmail;
                  advanceMicroStep(4);
                }}
              />
            {:else if microStep === 4}
              <PhonesStep
                nom={infoFields.nom}
                prenom={infoFields.prenom}
                email={infoFields.email}
                parentNom={infoFields.parentNom}
                parentPrenom={infoFields.parentPrenom}
                parentEmail={infoFields.parentEmail}
                parentPhone={infoFields.parentPhone}
                phone={infoFields.phone}
                errors={form?.errors}
              />
            {:else if microStep === 5}
              <LyceeStep
                highSchoolName={data.highSchoolName}
                highSchoolCity={data.highSchoolCity}
                error={form?.error}
              />
            {:else if microStep === 6}
              <InterestsStep
                interests={data.interests ?? []}
                selectedIds={data.selectedIds ?? []}
                error={form?.error}
                kind="tech"
                maxSelect={2}
                actionName="validateTechInterests"
              />
            {:else if microStep === 7}
              <InterestsStep
                interests={data.interests ?? []}
                selectedIds={data.selectedIds ?? []}
                error={form?.error}
                kind="general"
                maxSelect={5}
                actionName="validateGeneralInterests"
              />
            {:else if microStep === 8}
              <RulesStep error={form?.error} />
            {/if}
          </div>
        {/key}
      </div>
    {/if}

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propuls&eacute; par Epitech Academy
    </p>
  </div>
</div>
