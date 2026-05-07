<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import School from '@lucide/svelte/icons/school';
  import Search from '@lucide/svelte/icons/search';
  import PenLine from '@lucide/svelte/icons/pen-line';

  let {
    lyceeNom = '',
    lyceeVille = '',
    error,
  }: {
    lyceeNom?: string;
    lyceeVille?: string;
    error?: string;
  } = $props();

  let query = $state(lyceeNom);
  let selectedNom = $state(lyceeNom);
  let selectedVille = $state(lyceeVille);
  let suggestions = $state<{ nom: string; ville: string }[]>([]);
  let showSuggestions = $state(false);
  let freeTextMode = $state(false);
  let loading = $state(false);
  let noResults = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  const hasSelection = $derived(selectedNom.length >= 2);

  async function search(q: string) {
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
</script>

<div
  class="rounded-xl border border-slate-200 bg-white p-6 shadow-lg md:p-8 dark:border-slate-800 dark:bg-slate-900"
>
  <div class="mb-6 flex flex-col items-center gap-2">
    <div
      class="flex h-12 w-12 items-center justify-center rounded-full bg-epi-blue/10 text-epi-blue"
    >
      <School class="h-6 w-6" />
    </div>
    <h1 class="text-xl font-bold text-foreground">Dans quel lycée es-tu ?</h1>
    <p class="text-center text-sm text-muted-foreground">
      Cherche par nom ou ville.
    </p>
  </div>

  {#if error}
    <div
      class="mb-4 rounded-sm border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      {error}
    </div>
  {/if}

  <form method="POST" action="?/validateLycee" use:enhance>
    <input type="hidden" name="lyceeNom" value={selectedNom} />
    <input type="hidden" name="lyceeVille" value={selectedVille} />

    <div class="space-y-4">
      <div class="relative">
        <div class="relative">
          <Search
            class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
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

      {#if !freeTextMode && query.length >= 2 && !selectedNom}
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

    <div class="mt-6 flex justify-end">
      <Button type="submit" disabled={!hasSelection} class="px-6"
        >Suivant</Button
      >
    </div>
  </form>
</div>
