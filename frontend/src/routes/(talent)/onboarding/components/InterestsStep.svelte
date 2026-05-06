<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  let {
    categories,
    selectedIds = [],
    error,
  }: {
    categories: {
      id: string;
      nom: string;
      interests: { id: string; nom: string; emoji: string | null }[];
    }[];
    selectedIds?: string[];
    error?: string;
  } = $props();

  let selected = $state(new Set<string>(selectedIds));
  const count = $derived(selected.size);
  const canSubmit = $derived(count >= 3 && count <= 10);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < 10) {
      next.add(id);
    }
    selected = next;
  }
</script>

<div
  class="rounded-xl border border-slate-200 bg-white p-6 shadow-lg md:p-8 dark:border-slate-800 dark:bg-slate-900"
>
  <div class="mb-6 flex flex-col items-center gap-2">
    <div
      class="flex h-12 w-12 items-center justify-center rounded-full bg-epi-teal/10 text-epi-teal"
    >
      <Sparkles class="h-6 w-6" />
    </div>
    <h1 class="text-xl font-bold text-foreground">Tes centres d'intérêt</h1>
    <p class="text-center text-sm text-muted-foreground">
      Choisis entre 3 et 10 sujets qui te passionnent.
    </p>
  </div>

  {#if error}
    <div
      class="mb-4 rounded-sm border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      {error}
    </div>
  {/if}

  <form method="POST" action="?/validateInterests" use:enhance>
    {#each [...selected] as id}
      <input type="hidden" name="interestIds" value={id} />
    {/each}

    <div class="space-y-6">
      {#each categories as category (category.id)}
        <div>
          <h2
            class="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            {category.nom}
          </h2>
          <div class="flex flex-wrap gap-2">
            {#each category.interests as interest (interest.id)}
              {@const isSelected = selected.has(interest.id)}
              <button
                type="button"
                onclick={() => toggle(interest.id)}
                class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all hover:scale-105 active:scale-95
                  {isSelected
                  ? 'border-epi-teal bg-epi-teal text-white shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-epi-teal/50 hover:bg-epi-teal/5'}"
              >
                {#if interest.emoji}
                  <span>{interest.emoji}</span>
                {/if}
                <span>{interest.nom}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-6 flex items-center justify-between">
      <span
        class="text-sm font-medium {count < 3
          ? 'text-muted-foreground'
          : count >= 10
            ? 'text-orange-500'
            : 'text-epi-teal'}"
      >
        {count}/10 sélectionnés
        {#if count < 3}
          <span class="text-xs">— encore {3 - count}</span>
        {/if}
      </span>
      <Button type="submit" disabled={!canSubmit} class="px-6">Suivant</Button>
    </div>
  </form>
</div>
