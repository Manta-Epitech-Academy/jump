<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import Users from '@lucide/svelte/icons/users';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import { track } from '$lib/analytics';

  let {
    // Talent fields (hidden, accumulated from previous step)
    civilite,
    nom,
    prenom,
    email,
    phone,
    // Parent 1
    parentType = '',
    parentCivilite = '',
    parentNom = '',
    parentPrenom = '',
    parentEmail = '',
    parentPhone = '',
    // Parent 2
    parent2Type = '',
    parent2Civilite = '',
    parent2Nom = '',
    parent2Prenom = '',
    parent2Email = '',
    parent2Phone = '',
    // Lycée (hidden, accumulated)
    highSchoolName = '',
    highSchoolCity = '',
    highSchoolUai = '',
    errors,
    onvalidate,
  }: {
    civilite: string;
    nom: string;
    prenom: string;
    email: string;
    phone: string;
    parentType?: string;
    parentCivilite?: string;
    parentNom?: string;
    parentPrenom?: string;
    parentEmail?: string;
    parentPhone?: string;
    parent2Type?: string;
    parent2Civilite?: string;
    parent2Nom?: string;
    parent2Prenom?: string;
    parent2Email?: string;
    parent2Phone?: string;
    highSchoolName?: string;
    highSchoolCity?: string;
    highSchoolUai?: string;
    errors?: Record<string, string[]>;
    onvalidate: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let localParentType = $state(parentType);
  // svelte-ignore state_referenced_locally
  let localParentCivilite = $state(parentCivilite);

  let showParent2 = $state(!!(parent2Nom || parent2Prenom || parent2Email));
  // svelte-ignore state_referenced_locally
  let localP2Type = $state(parent2Type);
  // svelte-ignore state_referenced_locally
  let localP2Civilite = $state(parent2Civilite);

  const PARENT_TYPE_OPTIONS = [
    { value: 'pere', label: 'Père' },
    { value: 'mere', label: 'Mère' },
    { value: 'referent', label: 'Référent légal' },
  ];

  const CIVILITE_OPTIONS = [
    { value: 'homme', label: 'Homme' },
    { value: 'femme', label: 'Femme' },
    { value: 'autre', label: 'Autre' },
  ];
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <Users class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Ton responsable légal
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Allez, promis c'est bientôt fini !
  </p>
</div>

{#if errors}
  {#each Object.entries(errors) as [, msgs]}
    {#each msgs as msg}
      <p
        class="mb-2 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
      >
        {msg}
      </p>
    {/each}
  {/each}
{/if}

<form
  method="POST"
  action="?/validateProfile"
  use:enhance={() => {
    return async ({ result, update }) => {
      if (result.type === 'success') {
        track('onboarding_profile_validated');
        onvalidate();
        return;
      }
      if (result.type === 'failure') {
        track('onboarding_profile_validation_failed');
      }
      await update();
    };
  }}
  class="mt-6 space-y-3"
>
  <!-- Hidden fields: accumulated from talent step -->
  <input type="hidden" name="civilite" value={civilite} />
  <input type="hidden" name="nom" value={nom} />
  <input type="hidden" name="prenom" value={prenom} />
  <input type="hidden" name="email" value={email} />
  <input type="hidden" name="phone" value={phone} />
  <!-- Hidden fields: lycée (accumulated or from server) -->
  <input type="hidden" name="highSchoolName" value={highSchoolName} />
  <input type="hidden" name="highSchoolCity" value={highSchoolCity} />
  <input type="hidden" name="highSchoolUai" value={highSchoolUai} />
  <!-- Hidden chip values -->
  <input type="hidden" name="parentType" value={localParentType} />
  <input type="hidden" name="parentCivilite" value={localParentCivilite} />
  {#if showParent2}
    <input type="hidden" name="parent2Type" value={localP2Type} />
    <input type="hidden" name="parent2Civilite" value={localP2Civilite} />
  {/if}

  <!-- Parent type -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
      Lien <span class="text-red-500">*</span>
    </p>
    <div class="flex flex-wrap gap-2">
      {#each PARENT_TYPE_OPTIONS as opt}
        <button
          type="button"
          onclick={() => (localParentType = opt.value)}
          class="inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all
            {localParentType === opt.value
            ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Parent civilité -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
      Civilité <span class="text-red-500">*</span>
    </p>
    <div class="flex gap-2">
      {#each CIVILITE_OPTIONS as opt}
        <button
          type="button"
          onclick={() => (localParentCivilite = opt.value)}
          class="inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all
            {localParentCivilite === opt.value
            ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentPrenom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Prénom <span class="text-red-500">*</span>
    </label>
    <input
      id="parentPrenom"
      name="parentPrenom"
      type="text"
      value={parentPrenom}
      placeholder="Marie"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentNom"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Nom <span class="text-red-500">*</span>
    </label>
    <input
      id="parentNom"
      name="parentNom"
      type="text"
      value={parentNom}
      placeholder="Dupont"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentEmail"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Email <span class="text-red-500">*</span>
    </label>
    <input
      id="parentEmail"
      name="parentEmail"
      type="email"
      value={parentEmail}
      placeholder="parent@mail.com"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="parentPhone"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Téléphone <span class="text-red-500">*</span>
    </label>
    <input
      id="parentPhone"
      name="parentPhone"
      type="tel"
      value={parentPhone}
      placeholder="06 12 34 56 78"
      required
      class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <!-- ═══ Parent 2 (collapsible) ═══ -->
  {#if !showParent2}
    <button
      type="button"
      onclick={() => (showParent2 = true)}
      class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-3 text-sm font-medium text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:text-slate-300"
    >
      <Plus class="h-4 w-4" />
      Ajouter un second parent
    </button>
  {:else}
    <div class="mt-4 space-y-3">
      <div class="flex items-center justify-between">
        <h2
          class="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
        >
          <Users class="h-4 w-4" /> Second parent
          <span class="text-xs font-normal text-slate-400 normal-case"
            >(facultatif)</span
          >
        </h2>
        <button
          type="button"
          onclick={() => {
            showParent2 = false;
            localP2Type = '';
            localP2Civilite = '';
          }}
          class="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-red-500"
        >
          <X class="h-3.5 w-3.5" />
          Retirer
        </button>
      </div>

      <div
        class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          Lien
        </p>
        <div class="flex flex-wrap gap-2">
          {#each PARENT_TYPE_OPTIONS as opt}
            <button
              type="button"
              onclick={() => (localP2Type = opt.value)}
              class="inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all
                {localP2Type === opt.value
                ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div
        class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          Civilité
        </p>
        <div class="flex gap-2">
          {#each CIVILITE_OPTIONS as opt}
            <button
              type="button"
              onclick={() => (localP2Civilite = opt.value)}
              class="inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all
                {localP2Civilite === opt.value
                ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div
        class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <label
          for="parent2Prenom"
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
          >Prénom</label
        >
        <input
          id="parent2Prenom"
          name="parent2Prenom"
          type="text"
          value={parent2Prenom}
          placeholder="Sophie"
          class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>

      <div
        class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <label
          for="parent2Nom"
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
          >Nom</label
        >
        <input
          id="parent2Nom"
          name="parent2Nom"
          type="text"
          value={parent2Nom}
          placeholder="Dupont"
          class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>

      <div
        class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <label
          for="parent2Email"
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
          >Email</label
        >
        <input
          id="parent2Email"
          name="parent2Email"
          type="email"
          value={parent2Email}
          placeholder="parent2@mail.com"
          class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>

      <div
        class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <label
          for="parent2Phone"
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
          >Téléphone</label
        >
        <input
          id="parent2Phone"
          name="parent2Phone"
          type="tel"
          value={parent2Phone}
          placeholder="06 98 76 54 32"
          class="w-full rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
    </div>
  {/if}

  <Button
    type="submit"
    class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Valider et continuer
  </Button>
</form>
