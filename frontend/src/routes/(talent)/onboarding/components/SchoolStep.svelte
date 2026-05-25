<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import * as Command from '$lib/components/ui/command';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import School from '@lucide/svelte/icons/school';
  import Search from '@lucide/svelte/icons/search';
  import PenLine from '@lucide/svelte/icons/pen-line';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ContinueButton from './ContinueButton.svelte';

  type Lycee = { uai: string; nom: string; ville: string };

  let {
    profile,
    errors,
  }: {
    profile: { schoolUai: string; schoolName: string; schoolCity: string };
    errors?: Record<string, string[]>;
  } = $props();

  let submitting = $state(false);
  // Seed once from the loaded profile; the keyed step view recreates this
  // component per step, so the prop never changes while mounted.
  let query = $state(untrack(() => profile.schoolName));
  let selectedNom = $state(untrack(() => profile.schoolName));
  let selectedVille = $state(untrack(() => profile.schoolCity));
  let selectedUai = $state(untrack(() => profile.schoolUai));
  let changing = $state(untrack(() => !profile.schoolName));
  let suggestions = $state<Lycee[]>([]);
  let freeTextMode = $state(false);
  let loading = $state(false);
  let searched = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  const fieldInput =
    'rounded-lg border-slate-200 bg-white/70 text-slate-900 placeholder:text-slate-300 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600';
  const fieldLabel =
    'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

  async function searchLycee(q: string) {
    if (q.length < 2) {
      suggestions = [];
      searched = false;
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
      searched = true;
    }
  }

  function handleLyceeInput() {
    searched = false;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchLycee(query), 300);
  }

  function selectLycee(s: Lycee) {
    query = s.nom;
    selectedNom = s.nom;
    selectedVille = s.ville;
    selectedUai = s.uai;
    freeTextMode = false;
    changing = false;
  }

  function enableFreeText() {
    freeTextMode = true;
    changing = false;
    selectedNom = query;
    selectedVille = '';
    selectedUai = '';
  }

  function startChanging() {
    changing = true;
    freeTextMode = false;
    query = '';
    suggestions = [];
    searched = false;
  }
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <School class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    D'où viens-tu ?
  </h1>
</div>

<form
  method="POST"
  action="?/validateSchool"
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      if (result.type === 'success') {
        await invalidateAll();
        return;
      }
      await update();
      submitting = false;
    };
  }}
  class="space-y-4"
>
  <input type="hidden" name="schoolName" value={selectedNom} />
  <input type="hidden" name="schoolCity" value={selectedVille} />
  <input type="hidden" name="schoolUai" value={selectedUai} />

  <div class="space-y-3">
    {#if freeTextMode}
      <div
        class="grid grid-cols-2 gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div>
          <Label for="free-lycee-name" class={fieldLabel}
            >Nom du lycée <span class="text-red-500">*</span></Label
          >
          <Input
            id="free-lycee-name"
            type="text"
            placeholder="Lycée Victor Hugo"
            bind:value={selectedNom}
            class={fieldInput}
          />
          {#if errors?.schoolName}<span class="text-xs text-destructive"
              >{errors.schoolName[0]}</span
            >{/if}
        </div>
        <div>
          <Label for="free-lycee-city" class={fieldLabel}
            >Ville (optionnel)</Label
          >
          <Input
            id="free-lycee-city"
            type="text"
            placeholder="Paris"
            bind:value={selectedVille}
            class={fieldInput}
          />
        </div>
      </div>
      <button
        type="button"
        onclick={startChanging}
        class="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-epi-blue dark:text-slate-400"
      >
        <Search class="h-3.5 w-3.5" /> Rechercher dans l'annuaire
      </button>
    {:else if !changing}
      <div
        class="flex items-center justify-between gap-3 rounded-xl border border-epi-blue/20 bg-epi-blue/5 px-4 py-3"
      >
        <div class="flex items-start gap-3">
          <School class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
          <div>
            <p class="text-sm font-medium text-epi-blue">{selectedNom}</p>
            {#if selectedVille}<p
                class="text-xs text-slate-500 dark:text-slate-400"
              >
                {selectedVille}
              </p>{/if}
          </div>
        </div>
        <button
          type="button"
          onclick={startChanging}
          class="shrink-0 cursor-pointer text-xs font-medium text-slate-500 underline-offset-2 transition-colors hover:text-epi-blue hover:underline dark:text-slate-400"
        >
          Changer
        </button>
      </div>
    {:else}
      <Command.Root
        shouldFilter={false}
        class="overflow-hidden rounded-xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/80"
      >
        <Command.Input
          placeholder="Rechercher par nom ou ville..."
          bind:value={query}
          oninput={handleLyceeInput}
          class="text-slate-900 placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-600"
        />
        <Command.List class="max-h-72">
          {#if loading}
            <div
              class="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
            >
              <LoaderCircle class="h-4 w-4 animate-spin text-epi-blue" /> Recherche…
            </div>
          {:else if query.length < 2}
            <p class="py-6 text-center text-sm text-muted-foreground">
              Tape au moins 2 caractères.
            </p>
          {:else if searched && suggestions.length === 0}
            <p class="py-6 text-center text-sm text-muted-foreground">
              Aucun lycée trouvé.
            </p>
          {/if}

          {#each suggestions as s (s.uai)}
            <Command.Item
              value={s.uai}
              onSelect={() => selectLycee(s)}
              class="group cursor-pointer gap-3 rounded-none border-t border-slate-100 px-4 py-3 transition-all first:border-t-0 hover:bg-epi-blue/5 hover:pl-5 aria-selected:bg-epi-blue/5 dark:border-slate-800 dark:hover:bg-epi-blue/10 dark:aria-selected:bg-epi-blue/10"
            >
              <School
                class="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-epi-blue"
              />
              <span
                class="font-bold text-slate-700 transition-colors group-hover:text-epi-blue dark:text-slate-200"
                >{s.nom}</span
              >
              <span
                class="ml-auto shrink-0 text-sm font-semibold text-slate-400 transition-colors group-hover:text-epi-blue/70 dark:text-slate-500"
                >{s.ville}</span
              >
            </Command.Item>
          {/each}
        </Command.List>
      </Command.Root>

      <button
        type="button"
        onclick={enableFreeText}
        class="flex cursor-pointer items-center gap-2 px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <PenLine class="h-4 w-4" /> Mon lycée n'est pas dans la liste
      </button>
    {/if}
  </div>

  <ContinueButton
    {submitting}
    disabled={!selectedNom || selectedNom.length < 2}
    class="mt-4"
  />
</form>
