<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import School from '@lucide/svelte/icons/school';
  import Search from '@lucide/svelte/icons/search';
  import PenLine from '@lucide/svelte/icons/pen-line';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  let {
    highSchoolName = '',
    highSchoolCity = '',
    error,
  }: {
    highSchoolName?: string;
    highSchoolCity?: string;
    error?: string;
  } = $props();

  let query = $state(highSchoolName);
  let selectedNom = $state(highSchoolName);
  let selectedVille = $state(highSchoolCity);
  let suggestions = $state<{ nom: string; ville: string }[]>([]);
  let showSuggestions = $state(false);
  let freeTextMode = $state(false);
  let loading = $state(false);
  let noResults = $state(false);
  let searched = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;
  let containerEl: HTMLDivElement;

  const hasSelection = $derived(selectedNom.length >= 2);

  async function search(q: string) {
    if (q.length < 2) {
      suggestions = [];
      noResults = false;
      searched = false;
      return;
    }
    loading = true;
    noResults = false;
    try {
      const res = await fetch(`/api/lycees?q=${encodeURIComponent(q)}`);
      suggestions = await res.json();
      showSuggestions = suggestions.length > 0;
      noResults = suggestions.length === 0;
      searched = true;
    } catch {
      suggestions = [];
      noResults = true;
      searched = true;
    } finally {
      loading = false;
    }
  }

  function handleInput() {
    selectedNom = '';
    selectedVille = '';
    freeTextMode = false;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(query), 300);
  }

  function select(s: { nom: string; ville: string }) {
    query = s.nom;
    selectedNom = s.nom;
    selectedVille = s.ville;
    showSuggestions = false;
    freeTextMode = false;
  }

  function enableFreeText() {
    freeTextMode = true;
    showSuggestions = false;
    selectedNom = query;
    selectedVille = '';
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      showSuggestions = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showSuggestions = false;
    }
  }
</script>

<svelte:document onclick={handleClickOutside} onkeydown={handleKeydown} />

<div>
  <div class="mb-6 text-center">
    <div
      class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
    >
      <School class="h-7 w-7" />
    </div>
    <h1
      class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
    >
      Tu viens d'où ?
    </h1>
    <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
      Cherche ton lycée par nom ou ville.
    </p>
  </div>

  {#if error}
    <p
      class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
    >
      {error}
    </p>
  {/if}

  <form method="POST" action="?/validateLycee" use:enhance>
    <input type="hidden" name="highSchoolName" value={selectedNom} />
    <input type="hidden" name="highSchoolCity" value={selectedVille} />

    <div class="space-y-4">
      <div class="relative" bind:this={containerEl}>
        <div
          class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
        >
          <div class="relative">
            {#if loading}
              <LoaderCircle
                class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 animate-spin text-epi-blue"
              />
            {:else}
              <Search
                class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
            {/if}
            <Input
              type="text"
              placeholder="Rechercher par nom ou ville..."
              bind:value={query}
              oninput={handleInput}
              onfocus={() => {
                if (suggestions.length > 0) showSuggestions = true;
              }}
              class="pl-10"
              autocomplete="off"
            />
          </div>
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
                onclick={() => select(s)}
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
              <PenLine class="h-4 w-4" />
              Mon lycée n'est pas dans la liste
            </button>
          </div>
        {:else if noResults && !selectedNom && !freeTextMode}
          <p class="mt-2 text-sm text-muted-foreground">
            Aucun lycée trouvé pour cette recherche.
          </p>
        {/if}
      </div>

      {#if selectedNom && !freeTextMode}
        <div
          class="rounded-lg border border-epi-blue/30 bg-epi-blue/5 px-4 py-3 dark:bg-epi-blue/10"
        >
          <p class="text-sm font-medium text-epi-blue">{selectedNom}</p>
          {#if selectedVille}
            <p class="text-xs text-epi-blue/70">{selectedVille}</p>
          {/if}
        </div>
      {/if}

      {#if freeTextMode}
        <div class="space-y-2">
          <Input
            type="text"
            placeholder="Nom de ton lycée"
            bind:value={selectedNom}
            oninput={() => {
              query = selectedNom;
            }}
          />
          <Input
            type="text"
            placeholder="Ville (optionnel)"
            bind:value={selectedVille}
          />
        </div>
      {/if}

      {#if !freeTextMode && noResults && !selectedNom}
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onclick={enableFreeText}
        >
          <PenLine class="h-4 w-4" />
          Mon lycée n'est pas dans la liste
        </button>
      {/if}
    </div>

    <Button
      type="submit"
      disabled={!hasSelection}
      class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
    >
      Continuer
    </Button>
  </form>
</div>
