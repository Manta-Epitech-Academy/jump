<script lang="ts">
  import { enhance } from '$app/forms';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import Users from '@lucide/svelte/icons/users';
  import School from '@lucide/svelte/icons/school';
  import PenLine from '@lucide/svelte/icons/pen-line';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';

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

  // Shared glass-style overrides so the shadcn Input/Label keep the onboarding look.
  const fieldInput =
    'rounded-lg border-slate-200 bg-white/70 text-slate-900 placeholder:text-slate-300 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600';
  const fieldLabel =
    'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

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
  // A combobox: the trigger shows the current pick, the popover searches the annuaire.
  let query = $state('');
  // svelte-ignore state_referenced_locally
  let selectedNom = $state(profile.schoolName);
  // svelte-ignore state_referenced_locally
  let selectedVille = $state(profile.schoolCity);
  // svelte-ignore state_referenced_locally
  let selectedUai = $state(profile.schoolUai);
  let suggestions = $state<{ uai: string; nom: string; ville: string }[]>([]);
  let open = $state(false);
  let freeTextMode = $state(false);
  let loading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  async function searchLycee(q: string) {
    if (q.length < 2) {
      suggestions = [];
      return;
    }
    loading = true;
    try {
      const res = await fetch(`/api/lycees?q=${encodeURIComponent(q)}`);
      suggestions = await res.json();
    } catch {
      suggestions = [];
    } finally {
      loading = false;
    }
  }

  function handleLyceeInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchLycee(query), 300);
  }

  function selectLycee(s: { uai: string; nom: string; ville: string }) {
    selectedNom = s.nom;
    selectedVille = s.ville;
    selectedUai = s.uai;
    freeTextMode = false;
    open = false;
  }

  // Lycée absent from the annuaire → fall back to manual name/city entry,
  // pre-filling the name with whatever was typed.
  function enableFreeText() {
    freeTextMode = true;
    open = false;
    selectedNom = query;
    selectedVille = '';
    selectedUai = '';
  }

  // Reset the search each time the popover opens for a clean lookup.
  function onOpenChange(next: boolean) {
    if (next) {
      query = '';
      suggestions = [];
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
        <Label for="prenom" class={fieldLabel}>
          Prénom <span class="text-red-500">*</span>
        </Label>
        <Input
          id="prenom"
          name="prenom"
          type="text"
          value={profile.prenom}
          placeholder="Jean"
          required
          class={fieldInput}
        />
      </div>
      <div>
        <Label for="nom" class={fieldLabel}>
          Nom <span class="text-red-500">*</span>
        </Label>
        <Input
          id="nom"
          name="nom"
          type="text"
          value={profile.nom}
          placeholder="Dupont"
          required
          class={fieldInput}
        />
      </div>
    </div>

    <!-- Email + Téléphone on same row -->
    <div
      class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
        <Label for="email" class={fieldLabel}>
          Email <span class="text-red-500">*</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={profile.email}
          placeholder="jean.dupont@mail.com"
          required
          class={fieldInput}
        />
      </div>
      <div>
        <Label for="phone" class={fieldLabel}>
          Téléphone <span class="text-red-500">*</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          value={profile.phone}
          placeholder="06 98 76 54 32"
          required
          class={fieldInput}
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
        <Label for="parentPrenom" class={fieldLabel}>
          Prénom <span class="text-red-500">*</span>
        </Label>
        <Input
          id="parentPrenom"
          name="parentPrenom"
          type="text"
          value={profile.parentPrenom}
          placeholder="Marie"
          required
          class={fieldInput}
        />
      </div>
      <div>
        <Label for="parentNom" class={fieldLabel}>
          Nom <span class="text-red-500">*</span>
        </Label>
        <Input
          id="parentNom"
          name="parentNom"
          type="text"
          value={profile.parentNom}
          placeholder="Dupont"
          required
          class={fieldInput}
        />
      </div>
    </div>

    <!-- Email + Téléphone -->
    <div
      class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div>
        <Label for="parentEmail" class={fieldLabel}>
          Email <span class="text-red-500">*</span>
        </Label>
        <Input
          id="parentEmail"
          name="parentEmail"
          type="email"
          value={profile.parentEmail}
          placeholder="parent@mail.com"
          required
          class={fieldInput}
        />
      </div>
      <div>
        <Label for="parentPhone" class={fieldLabel}>
          Téléphone <span class="text-red-500">*</span>
        </Label>
        <Input
          id="parentPhone"
          name="parentPhone"
          type="tel"
          value={profile.parentPhone}
          placeholder="06 12 34 56 78"
          required
          class={fieldInput}
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
          <Label for="parent2Prenom" class={fieldLabel}>Prénom</Label>
          <Input
            id="parent2Prenom"
            name="parent2Prenom"
            type="text"
            value={profile.parent2Prenom}
            placeholder="Sophie"
            class={fieldInput}
          />
        </div>
        <div>
          <Label for="parent2Nom" class={fieldLabel}>Nom</Label>
          <Input
            id="parent2Nom"
            name="parent2Nom"
            type="text"
            value={profile.parent2Nom}
            placeholder="Dupont"
            class={fieldInput}
          />
        </div>
      </div>

      <div
        class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div>
          <Label for="parent2Email" class={fieldLabel}>Email</Label>
          <Input
            id="parent2Email"
            name="parent2Email"
            type="email"
            value={profile.parent2Email}
            placeholder="parent2@mail.com"
            class={fieldInput}
          />
        </div>
        <div>
          <Label for="parent2Phone" class={fieldLabel}>Téléphone</Label>
          <Input
            id="parent2Phone"
            name="parent2Phone"
            type="tel"
            value={profile.parent2Phone}
            placeholder="06 98 76 54 32"
            class={fieldInput}
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

    <Popover.Root bind:open {onOpenChange}>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            class="h-auto w-full justify-between rounded-xl border-epi-blue/20 bg-epi-blue/5 px-4 py-3 font-normal hover:bg-epi-blue/10"
            {...props}
          >
            <span class="flex min-w-0 items-start gap-3 text-left">
              <School class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
              {#if selectedNom}
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium text-epi-blue"
                    >{selectedNom}</span
                  >
                  {#if selectedVille}
                    <span
                      class="block text-xs text-slate-500 dark:text-slate-400"
                      >{selectedVille}</span
                    >
                  {/if}
                </span>
              {:else}
                <span class="text-sm text-muted-foreground"
                  >Rechercher ton lycée...</span
                >
              {/if}
            </span>
            <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content
        class="w-[--bits-popover-anchor-width] p-0"
        align="start"
      >
        <Command.Root shouldFilter={false}>
          <Command.Input
            placeholder="Rechercher par nom ou ville..."
            bind:value={query}
            oninput={handleLyceeInput}
          />
          <Command.List>
            {#if loading}
              <p class="py-6 text-center text-sm text-muted-foreground">
                Recherche…
              </p>
            {:else if query.length < 2}
              <p class="py-6 text-center text-sm text-muted-foreground">
                Tape au moins 2 caractères.
              </p>
            {:else if suggestions.length === 0}
              <p class="py-6 text-center text-sm text-muted-foreground">
                Aucun lycée trouvé.
              </p>
            {/if}

            {#each suggestions as s (s.uai)}
              <Command.Item value={s.uai} onSelect={() => selectLycee(s)}>
                <School class="h-4 w-4 shrink-0 text-slate-400" />
                <span class="font-medium">{s.nom}</span>
                <span class="ml-auto text-xs text-muted-foreground"
                  >{s.ville}</span
                >
              </Command.Item>
            {/each}

            <Command.Separator />
            <Command.Item value="__free-text__" onSelect={enableFreeText}>
              <PenLine class="h-4 w-4 text-muted-foreground" />
              Mon lycée n'est pas dans la liste
            </Command.Item>
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>

    {#if freeTextMode}
      <div
        class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div>
          <Label for="free-lycee-name" class={fieldLabel}>
            Nom du lycée <span class="text-red-500">*</span>
          </Label>
          <Input
            id="free-lycee-name"
            type="text"
            placeholder="Lycée Victor Hugo"
            bind:value={selectedNom}
            class={fieldInput}
          />
        </div>
        <div>
          <Label for="free-lycee-city" class={fieldLabel}>
            Ville (optionnel)
          </Label>
          <Input
            id="free-lycee-city"
            type="text"
            placeholder="Paris"
            bind:value={selectedVille}
            class={fieldInput}
          />
        </div>
      </div>
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
