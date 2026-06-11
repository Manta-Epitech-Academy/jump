<script lang="ts">
  import { untrack } from 'svelte';
  import { base } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import IdCard from '@lucide/svelte/icons/id-card';
  import Printer from '@lucide/svelte/icons/printer';
  import Search from '@lucide/svelte/icons/search';
  import CameraOff from '@lucide/svelte/icons/camera-off';
  import Loader2 from '@lucide/svelte/icons/loader-2';

  let { data } = $props();

  let query = $state('');
  // Default: every badge checked. Seeded once from the initial load; navigating
  // to a new stage reloads the page, so this never needs to re-track `data`.
  let selected = $state<Set<string>>(
    untrack(() => new Set(data.talents.map((t) => t.id))),
  );
  let printing = $state(false);
  let errorMsg = $state<string | null>(null);

  const normalized = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = $derived.by(() => {
    const q = normalized(query.trim());
    if (!q) return data.talents;
    return data.talents.filter((t) =>
      normalized(`${t.prenom} ${t.nom}`).includes(q),
    );
  });

  const allSelected = $derived(
    data.talents.length > 0 && selected.size === data.talents.length,
  );

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  function toggleAll() {
    selected = allSelected ? new Set() : new Set(data.talents.map((t) => t.id));
  }

  async function print() {
    if (printing || selected.size === 0) return;
    printing = true;
    errorMsg = null;
    try {
      const ids = data.talents
        .filter((t) => selected.has(t.id))
        .map((t) => t.id);
      const res = await fetch(`${base}/staff/dev/badges/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        throw new Error(`Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'badges-stage.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      errorMsg = 'La génération du PDF a échoué. Réessayez dans un instant.';
      console.error(e);
    } finally {
      printing = false;
    }
  }
</script>

<svelte:head>
  <title>Badges - Stage de Seconde</title>
</svelte:head>

<div class="mx-auto w-full max-w-6xl p-4 sm:p-6">
  <header class="mb-6 flex flex-col gap-1">
    <div class="flex items-center gap-2">
      <IdCard class="h-6 w-6 text-epi-teal" />
      <h1 class="text-2xl font-semibold">Badges</h1>
    </div>
    <p class="text-sm text-muted-foreground">
      {#if data.stage}
        Badges des stagiaires inscrits au stage de seconde actif. Cochez ceux à
        imprimer, puis générez le PDF (format A6, 4 badges par page A4 à
        découper).
      {:else}
        Aucun stage de seconde actif sur ce campus pour le moment.
      {/if}
    </p>
  </header>

  {#if data.stage}
    <div
      class="sticky top-0 z-10 mb-6 flex flex-col gap-3 rounded-lg border bg-background/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="relative w-full sm:max-w-xs">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          placeholder="Rechercher un stagiaire…"
          bind:value={query}
          class="pl-9"
        />
      </div>

      <div class="flex items-center gap-3">
        <span class="text-sm text-muted-foreground">
          {selected.size} / {data.talents.length} sélectionné{selected.size > 1
            ? 's'
            : ''}
        </span>
        <Button variant="outline" size="sm" onclick={toggleAll}>
          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </Button>
        <Button
          size="sm"
          onclick={print}
          disabled={printing || selected.size === 0}
        >
          {#if printing}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            Génération…
          {:else}
            <Printer class="mr-2 h-4 w-4" />
            Imprimer
          {/if}
        </Button>
      </div>
    </div>

    {#if errorMsg}
      <p
        class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {errorMsg}
      </p>
    {/if}

    {#if filtered.length === 0}
      <p class="py-12 text-center text-sm text-muted-foreground">
        Aucun stagiaire ne correspond à « {query} ».
      </p>
    {:else}
      <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {#each filtered as t (t.id)}
          {@const isSelected = selected.has(t.id)}
          <li>
            <button
              type="button"
              onclick={() => toggle(t.id)}
              aria-pressed={isSelected}
              class="group relative flex aspect-[105/148] w-full flex-col items-center justify-center rounded-lg border-2 p-4 text-center transition
                {isSelected
                ? 'border-epi-teal bg-epi-teal/5'
                : 'border-border bg-muted/30 opacity-60 hover:opacity-100'}"
            >
              <span
                class="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded border
                  {isSelected
                  ? 'border-epi-teal bg-epi-teal text-white'
                  : 'border-muted-foreground/40 bg-background'}"
                aria-hidden="true"
              >
                {#if isSelected}✓{/if}
              </span>

              <span class="text-lg leading-tight font-bold">{t.prenom}</span>
              <span
                class="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
                >{t.nom}</span
              >

              {#if t.imageRefused}
                <span
                  class="mt-3 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700"
                >
                  <CameraOff class="h-3 w-3" />
                  Droit à l'image interdit
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
