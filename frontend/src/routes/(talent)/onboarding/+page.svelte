<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { TransitionConfig } from 'svelte/transition';
  import { enhance } from '$app/forms';
  import ProgressBar from './components/ProgressBar.svelte';
  import TalentInfoStep from './components/TalentInfoStep.svelte';
  import ParentInfoStep from './components/ParentInfoStep.svelte';
  import LyceeStep from './components/LyceeStep.svelte';
  import InterestsCombinedStep from './components/InterestsCombinedStep.svelte';
  import EquipmentStep from './components/EquipmentStep.svelte';
  import RulesStep from './components/RulesStep.svelte';
  import BackButton from './components/BackButton.svelte';

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

  // Server step → first micro-step mapping
  // profile has 3 sub-steps: 1=talent, 2=parent, 3=lycée
  const SERVER_STEP_TO_MICRO: Record<string, number> = {
    profile: 1,
    interests: 4,
    equipment: 5,
    rules: 6,
  };

  const TOTAL_MICRO_STEPS = 6;

  // svelte-ignore state_referenced_locally
  let microStep = $state(SERVER_STEP_TO_MICRO[data.step] ?? 1);
  // svelte-ignore state_referenced_locally
  let lastServerStep = $state(data.step);
  let navigatingBack = $state(false);

  // Accumulated fields for profile sub-steps (talent info → parent info → lycée)
  // svelte-ignore state_referenced_locally
  let profileFields = $state({
    civilite: data.profile?.civilite ?? '',
    nom: data.profile?.nom ?? '',
    prenom: data.profile?.prenom ?? '',
    email: data.profile?.email ?? '',
    phone: data.profile?.phone ?? '',
    parentType: data.profile?.parentType ?? '',
    parentCivilite: data.profile?.parentCivilite ?? '',
    parentNom: data.profile?.parentNom ?? '',
    parentPrenom: data.profile?.parentPrenom ?? '',
    parentEmail: data.profile?.parentEmail ?? '',
    parentPhone: data.profile?.parentPhone ?? '',
    parent2Type: data.profile?.parent2Type ?? '',
    parent2Civilite: data.profile?.parent2Civilite ?? '',
    parent2Nom: data.profile?.parent2Nom ?? '',
    parent2Prenom: data.profile?.parent2Prenom ?? '',
    parent2Email: data.profile?.parent2Email ?? '',
    parent2Phone: data.profile?.parent2Phone ?? '',
    highSchoolName: data.profile?.highSchoolName ?? '',
    highSchoolCity: data.profile?.highSchoolCity ?? '',
    highSchoolUai: data.profile?.highSchoolUai ?? '',
  });

  let goBackForm: HTMLFormElement;

  // Sync microStep when the server step changes (after form POST + redirect)
  $effect(() => {
    if (data.step !== lastServerStep) {
      lastServerStep = data.step;

      if (navigatingBack && data.step === 'profile') {
        // Coming back from interests: land on lycée (micro 3) with fresh data
        profileFields = {
          civilite: data.profile?.civilite ?? '',
          nom: data.profile?.nom ?? '',
          prenom: data.profile?.prenom ?? '',
          email: data.profile?.email ?? '',
          phone: data.profile?.phone ?? '',
          parentType: data.profile?.parentType ?? '',
          parentCivilite: data.profile?.parentCivilite ?? '',
          parentNom: data.profile?.parentNom ?? '',
          parentPrenom: data.profile?.parentPrenom ?? '',
          parentEmail: data.profile?.parentEmail ?? '',
          parentPhone: data.profile?.parentPhone ?? '',
          parent2Type: data.profile?.parent2Type ?? '',
          parent2Civilite: data.profile?.parent2Civilite ?? '',
          parent2Nom: data.profile?.parent2Nom ?? '',
          parent2Prenom: data.profile?.parent2Prenom ?? '',
          parent2Email: data.profile?.parent2Email ?? '',
          parent2Phone: data.profile?.parent2Phone ?? '',
          highSchoolName: data.profile?.highSchoolName ?? '',
          highSchoolCity: data.profile?.highSchoolCity ?? '',
          highSchoolUai: data.profile?.highSchoolUai ?? '',
        };
        // Going back lands on lycée sub-step (info already validated)
        microStep = 3;
      } else {
        microStep = SERVER_STEP_TO_MICRO[data.step] ?? 1;
      }

      navigatingBack = false;
    }
  });

  // If server returned validation errors on validateProfile, jump to parent step
  // and re-populate fields from the submitted values
  $effect(() => {
    if (form?.errors && data.step === 'profile') {
      if (form.values) {
        const v = form.values as Record<string, string>;
        profileFields.parentType = v.parentType ?? profileFields.parentType;
        profileFields.parentCivilite =
          v.parentCivilite ?? profileFields.parentCivilite;
        profileFields.parentNom = v.parentNom ?? profileFields.parentNom;
        profileFields.parentPrenom =
          v.parentPrenom ?? profileFields.parentPrenom;
        profileFields.parentEmail = v.parentEmail ?? profileFields.parentEmail;
        profileFields.parentPhone = v.parentPhone ?? profileFields.parentPhone;
        profileFields.parent2Type = v.parent2Type ?? profileFields.parent2Type;
        profileFields.parent2Civilite =
          v.parent2Civilite ?? profileFields.parent2Civilite;
        profileFields.parent2Nom = v.parent2Nom ?? profileFields.parent2Nom;
        profileFields.parent2Prenom =
          v.parent2Prenom ?? profileFields.parent2Prenom;
        profileFields.parent2Email =
          v.parent2Email ?? profileFields.parent2Email;
        profileFields.parent2Phone =
          v.parent2Phone ?? profileFields.parent2Phone;
      }
      microStep = 2;
    }
  });

  const progress = $derived(
    Math.round((microStep / TOTAL_MICRO_STEPS) * 90 + 10),
  );

  const TITLES: Record<number, string> = {
    1: 'Tes infos',
    2: 'Ton parent',
    3: 'Ton lycée',
    4: "Centres d'intérêt",
    5: 'Ton matériel',
    6: 'Règlement',
  };
  const pageTitle = $derived(TITLES[microStep] ?? 'Onboarding');

  function goBackClient(step: number) {
    microStep = step;
  }

  function goBackServer() {
    navigatingBack = true;
    goBackForm.requestSubmit();
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

  <!-- Hidden form for server-side go-back -->
  <form
    bind:this={goBackForm}
    method="POST"
    action="?/goBack"
    use:enhance
    class="hidden"
  ></form>

  <div class="z-10 w-full max-w-lg">
    <div class="relative">
      {#key microStep}
        <div
          class="w-full"
          in:fly|local={{ x: 30, duration: 300, delay: 280 }}
          out:exitSlide|local={{ duration: 250 }}
        >
          {#if microStep === 1}
            <TalentInfoStep
              civilite={profileFields.civilite}
              prenom={profileFields.prenom}
              nom={profileFields.nom}
              email={profileFields.email}
              phone={profileFields.phone}
              onvalidate={(d) => {
                profileFields.civilite = d.civilite;
                profileFields.prenom = d.prenom;
                profileFields.nom = d.nom;
                profileFields.email = d.email;
                profileFields.phone = d.phone;
                microStep = 2;
              }}
            />
          {:else if microStep === 2}
            <BackButton onclick={() => goBackClient(1)} />
            <ParentInfoStep
              civilite={profileFields.civilite}
              nom={profileFields.nom}
              prenom={profileFields.prenom}
              email={profileFields.email}
              phone={profileFields.phone}
              parentType={profileFields.parentType}
              parentCivilite={profileFields.parentCivilite}
              parentNom={profileFields.parentNom}
              parentPrenom={profileFields.parentPrenom}
              parentEmail={profileFields.parentEmail}
              parentPhone={profileFields.parentPhone}
              parent2Type={profileFields.parent2Type}
              parent2Civilite={profileFields.parent2Civilite}
              parent2Nom={profileFields.parent2Nom}
              parent2Prenom={profileFields.parent2Prenom}
              parent2Email={profileFields.parent2Email}
              parent2Phone={profileFields.parent2Phone}
              highSchoolName={profileFields.highSchoolName}
              highSchoolCity={profileFields.highSchoolCity}
              highSchoolUai={profileFields.highSchoolUai}
              errors={form?.errors}
            />
          {:else if microStep === 3}
            <BackButton onclick={() => goBackClient(2)} />
            <LyceeStep
              highSchoolName={data.profile?.highSchoolName ??
                profileFields.highSchoolName}
              highSchoolCity={data.profile?.highSchoolCity ??
                profileFields.highSchoolCity}
              highSchoolUai={data.profile?.highSchoolUai ??
                profileFields.highSchoolUai}
              error={form?.error}
            />
          {:else if microStep === 4}
            <BackButton onclick={goBackServer} />
            <InterestsCombinedStep
              techInterests={data.techInterests ?? []}
              generalInterests={data.generalInterests ?? []}
              selectedTechIds={data.selectedTechIds ?? []}
              selectedGeneralIds={data.selectedGeneralIds ?? []}
              freeText={data.freeText ?? ''}
              error={form?.error}
            />
          {:else if microStep === 5}
            <BackButton onclick={goBackServer} />
            <EquipmentStep
              hasLaptop={data.hasLaptop ?? false}
              setupDescription={data.setupDescription ?? ''}
              error={form?.error}
            />
          {:else if microStep === 6}
            <BackButton onclick={goBackServer} />
            <RulesStep error={form?.error} />
          {/if}
        </div>
      {/key}
    </div>

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propuls&eacute; par Epitech Academy
    </p>
  </div>
</div>
