<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import Users from '@lucide/svelte/icons/users';
  import School from '@lucide/svelte/icons/school';
  import Search from '@lucide/svelte/icons/search';
  import PenLine from '@lucide/svelte/icons/pen-line';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import { track } from '$lib/analytics';

  let {
    profile,
    errors,
  }: {
    profile: {
      civilite: string;
      nom: string;
      prenom: string;
      email: string;
      phone: string;
      parentType: string;
      parentCivilite: string;
      parentNom: string;
      parentPrenom: string;
      parentEmail: string;
      parentPhone: string;
      parent2Type: string;
      parent2Civilite: string;
      parent2Nom: string;
      parent2Prenom: string;
      parent2Email: string;
      parent2Phone: string;
      schoolUai: string;
      schoolName: string;
      schoolCity: string;
    };
    errors?: Record<string, string[]>;
  } = $props();

  // Local state for chips
  // svelte-ignore state_referenced_locally
  let localCivilite = $state(profile.civilite);
  // svelte-ignore state_referenced_locally
  let localParentType = $state(profile.parentType);
  // svelte-ignore state_referenced_locally
  let localParentCivilite = $state(profile.parentCivilite);
  // svelte-ignore state_referenced_locally
  let localP2Type = $state(profile.parent2Type);
  // svelte-ignore state_referenced_locally
  let localP2Civilite = $state(profile.parent2Civilite);

  // Parent 2 toggle
  // svelte-ignore state_referenced_locally
  let showParent2 = $state(
    !!(profile.parent2Nom || profile.parent2Prenom || profile.parent2Email),
  );

  // Lycée — pre-filled from the talent's current school (seeded from Salesforce).
  // Starts as a confirmation card; "changer" reveals the annuaire search.
  // svelte-ignore state_referenced_locally
  let query = $state(profile.schoolName);
  // svelte-ignore state_referenced_locally
  let selectedNom = $state(profile.schoolName);
  // svelte-ignore state_referenced_locally
  let selectedVille = $state(profile.schoolCity);
  // svelte-ignore state_referenced_locally
  let selectedUai = $state(profile.schoolUai);
  // svelte-ignore state_referenced_locally
  let changing = $state(!profile.schoolName);
  let suggestions = $state<{ uai: string; nom: string; ville: string }[]>([]);
  let showSuggestions = $state(false);
  let freeTextMode = $state(false);
  let loading = $state(false);
  let noResults = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;
  let containerEl = $state<HTMLDivElement>();

  async function searchLycee(q: string) {
    if (q.length < 2) {
      suggestions = [];
      noResults = false;
      return;
    }
    loading = true;
    noResults = false;
    try {
      const res = await fetch(`/api/lycees?q=${encodeURIComponent(q)}`);
      suggestions = await res.json();
      showSuggestions = suggestions.length > 0;
      noResults = suggestions.length === 0;
    } catch {
      suggestions = [];
      noResults = true;
    } finally {
      loading = false;
    }
  }

  function handleLyceeInput() {
    selectedNom = '';
    selectedVille = '';
    selectedUai = '';
    freeTextMode = false;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchLycee(query), 300);
  }

  function selectLycee(s: { uai: string; nom: string; ville: string }) {
    query = s.nom;
    selectedNom = s.nom;
    selectedVille = s.ville;
    selectedUai = s.uai;
    showSuggestions = false;
    freeTextMode = false;
    changing = false;
  }

  function enableFreeText() {
    freeTextMode = true;
    showSuggestions = false;
    selectedNom = query;
    selectedVille = '';
    selectedUai = '';
  }

  // Switch from the confirmation card back to the search to pick another lycée.
  function startChanging() {
    changing = true;
    query = selectedNom;
    suggestions = [];
    showSuggestions = false;
    freeTextMode = false;
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      showSuggestions = false;
    }
  }

  const CIVILITE_OPTIONS = [
    { value: 'homme', label: 'Homme' },
    { value: 'femme', label: 'Femme' },
    { value: 'autre', label: 'Autre' },
  ];

  const PARENT_TYPE_OPTIONS = [
    { value: 'pere', label: 'Père' },
    { value: 'mere', label: 'Mère' },
    { value: 'referent', label: 'Référent légal' },
  ];
</script>

<svelte:document onclick={handleClickOutside} />

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <UserCheck class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Faisons connaissance !
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Vérifie et complète tes informations
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

<form method="POST" action="?/validateProfile" use:enhance class="space-y-6">
  <!-- Hidden chip values -->
  <input type="hidden" name="civilite" value={localCivilite} />
  <input type="hidden" name="parentType" value={localParentType} />
  <input type="hidden" name="parentCivilite" value={localParentCivilite} />
  <input type="hidden" name="schoolName" value={selectedNom} />
  <input type="hidden" name="schoolCity" value={selectedVille} />
  <input type="hidden" name="schoolUai" value={selectedUai} />
  {#if showParent2}
    <input type="hidden" name="parent2Type" value={localP2Type} />
    <input type="hidden" name="parent2Civilite" value={localP2Civilite} />
  {/if}

  <!-- ═══ Tes informations ═══ -->
  <div class="space-y-3">
    <h2
      class="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
    >
      <UserCheck class="h-4 w-4" /> Tes informations
    </h2>

    <!-- Civilité -->
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
            onclick={() => (localCivilite = opt.value)}
            class="inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all
              {localCivilite === opt.value
              ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Prénom + Nom on same row -->
    <div
      class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
        <label
          for="prenom"
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          Prénom <span class="text-red-500">*</span>
        </label>
        <input
          id="prenom"
          name="prenom"
          type="text"
          value={profile.prenom}
          placeholder="Jean"
          required
          class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
      <div>
        <label
          for="nom"
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          Nom <span class="text-red-500">*</span>
        </label>
        <input
          id="nom"
          name="nom"
          type="text"
          value={profile.nom}
          placeholder="Dupont"
          required
          class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
    </div>

    <!-- Email + Téléphone on same row -->
    <div
      class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
        <label
          for="email"
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          Email <span class="text-red-500">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={profile.email}
          placeholder="jean.dupont@mail.com"
          required
          class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
      <div>
        <label
          for="phone"
          class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          Téléphone <span class="text-red-500">*</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={profile.phone}
          placeholder="06 98 76 54 32"
          required
          class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
    </div>
  </div>

  <!-- ═══ Référent légal ═══ -->
  <div class="space-y-3">
    <h2
      class="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
    >
      <Users class="h-4 w-4" /> Référent légal
    </h2>

    <!-- Type + Civilité on same row -->
    <div
      class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
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
      <div>
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
    </div>

    <!-- Prénom + Nom -->
    <div
      class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
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
          value={profile.parentPrenom}
          placeholder="Marie"
          required
          class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
      <div>
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
          value={profile.parentNom}
          placeholder="Dupont"
          required
          class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
    </div>

    <!-- Email + Téléphone -->
    <div
      class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
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
          value={profile.parentEmail}
          placeholder="parent@mail.com"
          required
          class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
      <div>
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
          value={profile.parentPhone}
          placeholder="06 12 34 56 78"
          required
          class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>
    </div>
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
    <div class="space-y-3">
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
        class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div>
          <p
            class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Lien
          </p>
          <div class="flex flex-wrap gap-2">
            {#each PARENT_TYPE_OPTIONS as opt}
              <button
                type="button"
                onclick={() => (localP2Type = opt.value)}
                class="inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all {localP2Type ===
                opt.value
                  ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
              >
                {opt.label}
              </button>
            {/each}
          </div>
        </div>
        <div>
          <p
            class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Civilité
          </p>
          <div class="flex gap-2">
            {#each CIVILITE_OPTIONS as opt}
              <button
                type="button"
                onclick={() => (localP2Civilite = opt.value)}
                class="inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all {localP2Civilite ===
                opt.value
                  ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}"
              >
                {opt.label}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div
        class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div>
          <label
            for="parent2Prenom"
            class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >Prénom</label
          >
          <input
            id="parent2Prenom"
            name="parent2Prenom"
            type="text"
            value={profile.parent2Prenom}
            placeholder="Sophie"
            class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
          />
        </div>
        <div>
          <label
            for="parent2Nom"
            class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >Nom</label
          >
          <input
            id="parent2Nom"
            name="parent2Nom"
            type="text"
            value={profile.parent2Nom}
            placeholder="Dupont"
            class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
          />
        </div>
      </div>

      <div
        class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div>
          <label
            for="parent2Email"
            class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >Email</label
          >
          <input
            id="parent2Email"
            name="parent2Email"
            type="email"
            value={profile.parent2Email}
            placeholder="parent2@mail.com"
            class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
          />
        </div>
        <div>
          <label
            for="parent2Phone"
            class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >Téléphone</label
          >
          <input
            id="parent2Phone"
            name="parent2Phone"
            type="tel"
            value={profile.parent2Phone}
            placeholder="06 98 76 54 32"
            class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
          />
        </div>
      </div>
    </div>
  {/if}

  <!-- ═══ Ton lycée ═══ -->
  <div class="space-y-3">
    <h2
      class="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
    >
      <School class="h-4 w-4" /> Ton lycée
    </h2>

    {#if !changing}
      <!-- Pre-filled lycée: confirm in one tap, or open the search to change it. -->
      <div
        class="flex items-center justify-between gap-3 rounded-xl border border-epi-blue/20 bg-epi-blue/5 px-4 py-3"
      >
        <div class="flex items-start gap-3">
          <School class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
          <div>
            <p class="text-sm font-medium text-epi-blue">{selectedNom}</p>
            {#if selectedVille}
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {selectedVille}
              </p>
            {/if}
          </div>
        </div>
        <button
          type="button"
          onclick={startChanging}
          class="shrink-0 cursor-pointer text-xs font-medium text-slate-500 underline-offset-2 transition-colors hover:text-epi-blue hover:underline dark:text-slate-400"
        >
          Ce n'est pas ton lycée ?
        </button>
      </div>
    {:else}
      <div class="relative" bind:this={containerEl}>
        <div
          class="relative rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
        >
          {#if loading}
            <LoaderCircle
              class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 animate-spin text-epi-blue"
            />
          {:else}
            <Search
              class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            />
          {/if}
          <input
            id="lycee-search"
            type="text"
            placeholder="Rechercher par nom ou ville..."
            bind:value={query}
            oninput={handleLyceeInput}
            onfocus={() => {
              if (suggestions.length > 0) showSuggestions = true;
            }}
            autocomplete="off"
            class="w-full rounded-lg border border-slate-200 bg-white/70 py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
          />
        </div>

        {#if showSuggestions}
          <div
            class="absolute z-10 mt-2 max-h-96 w-full overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/95"
          >
            {#each suggestions as s, i}
              <button
                type="button"
                class="group flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-3.5 text-left text-sm transition-all duration-150 hover:bg-epi-blue/5 hover:pl-5 active:bg-epi-blue/10 dark:hover:bg-epi-blue/10 {i >
                0
                  ? 'border-t border-slate-100 dark:border-slate-800'
                  : ''}"
                onclick={() => selectLycee(s)}
              >
                <div class="flex items-start gap-3">
                  <School
                    class="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-epi-blue"
                  />
                  <span
                    class="font-bold text-slate-700 transition-colors group-hover:text-epi-blue dark:text-slate-200"
                    >{s.nom}</span
                  >
                </div>
                <span
                  class="shrink-0 text-sm font-semibold text-slate-400 transition-colors group-hover:text-epi-blue/70 dark:text-slate-500"
                  >{s.ville}</span
                >
              </button>
            {/each}
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:border-slate-800"
              onclick={enableFreeText}
            >
              <PenLine class="h-4 w-4" /> Mon lycée n'est pas dans la liste
            </button>
          </div>
        {:else if noResults && !selectedNom && !freeTextMode}
          <p class="mt-2 text-sm text-muted-foreground">Aucun lycée trouvé.</p>
        {/if}
      </div>

      {#if freeTextMode}
        <div
          class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
        >
          <div>
            <label
              for="free-lycee-name"
              class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Nom du lycée <span class="text-red-500">*</span>
            </label>
            <input
              id="free-lycee-name"
              type="text"
              placeholder="Lycée Victor Hugo"
              bind:value={selectedNom}
              oninput={() => {
                query = selectedNom;
              }}
              class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
            />
          </div>
          <div>
            <label
              for="free-lycee-city"
              class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >Ville (optionnel)</label
            >
            <input
              id="free-lycee-city"
              type="text"
              placeholder="Paris"
              bind:value={selectedVille}
              class="w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
            />
          </div>
        </div>
      {/if}

      {#if !freeTextMode && noResults && !selectedNom}
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onclick={enableFreeText}
        >
          <PenLine class="h-4 w-4" /> Mon lycée n'est pas dans la liste
        </button>
      {/if}
    {/if}
  </div>

  <Button
    type="submit"
    disabled={!selectedNom || selectedNom.length < 2}
    class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Continuer
  </Button>
</form>
