<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Code from '@lucide/svelte/icons/code';

  let {
    interests,
    selectedIds = [],
    error,
    kind,
    maxSelect,
    actionName,
    techSelections,
  }: {
    interests: { id: string; nom: string; emoji: string | null }[];
    selectedIds?: string[];
    error?: string;
    kind: 'tech' | 'general';
    maxSelect: number;
    actionName: string;
    techSelections?: { nom: string; emoji: string | null }[];
  } = $props();

  // Shuffle interests on mount (avoid positional bias)
  const shuffled = $derived.by(() => {
    const arr = [...interests];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });

  let selected = $state(new Set<string>(selectedIds));
  const count = $derived(selected.size);
  const minSelect = 1;
  const canSubmit = $derived(count >= minSelect && count <= maxSelect);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < maxSelect) {
      next.add(id);
    }
    selected = next;
  }

  // IKEA effect: build a recap phrase from selections
  const recapPhrase = $derived.by(() => {
    if (count === 0) return '';
    const names = shuffled
      .filter((i) => selected.has(i.id))
      .map((i) => `${i.emoji ?? ''} ${i.nom}`.trim());
    if (kind === 'tech') {
      return `Tu es attiré par ${names.join(' et ')}`;
    }
    if (names.length === 1) return `Tu aimes ${names[0]}`;
    const last = names.pop();
    return `Tu aimes ${names.join(', ')} et ${last}`;
  });

  const title =
    kind === 'tech'
      ? "Qu'est-ce qui t'attire en informatique ?"
      : 'Et en dehors du code ?';

  const subtitle =
    kind === 'tech'
      ? `Choisis 1 ou 2 domaines qui t'intéressent.`
      : `Choisis entre 1 et 5 sujets qui te passionnent.`;
</script>

<div
  class="rounded-xl border border-slate-200 bg-white p-6 shadow-lg md:p-8 dark:border-slate-800 dark:bg-slate-900"
>
  <div class="mb-6 flex flex-col items-center gap-2">
    <div
      class="flex h-12 w-12 items-center justify-center rounded-full {kind ===
      'tech'
        ? 'bg-epi-blue/10 text-epi-blue'
        : 'bg-epi-teal/10 text-epi-teal'}"
    >
      {#if kind === 'tech'}
        <Code class="h-6 w-6" />
      {:else}
        <Sparkles class="h-6 w-6" />
      {/if}
    </div>
    <h1 class="text-xl font-bold text-foreground">{title}</h1>
    <p class="text-center text-sm text-muted-foreground">
      {subtitle}
    </p>
  </div>

  {#if techSelections && techSelections.length > 0}
    <div
      class="mb-4 rounded-lg bg-epi-blue/5 px-4 py-3 text-center text-sm text-epi-blue dark:bg-epi-blue/10"
    >
      Tu es attiré par {techSelections
        .map((t) => `${t.emoji ?? ''} ${t.nom}`.trim())
        .join(' et ')} — maintenant, parle-nous de toi !
    </div>
  {/if}

  {#if error}
    <div
      class="mb-4 rounded-sm border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      {error}
    </div>
  {/if}

  <form method="POST" action="?/{actionName}" use:enhance>
    {#each [...selected] as id}
      <input type="hidden" name="interestIds" value={id} />
    {/each}

    <div class="flex flex-wrap gap-2">
      {#each shuffled as interest (interest.id)}
        {@const isSelected = selected.has(interest.id)}
        <button
          type="button"
          onclick={() => toggle(interest.id)}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all hover:scale-105 active:scale-95
            {isSelected
            ? 'border-epi-blue bg-epi-blue/10 text-epi-blue shadow-sm dark:bg-epi-blue/20'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700'}"
        >
          {#if interest.emoji}
            <span>{interest.emoji}</span>
          {/if}
          <span>{interest.nom}</span>
        </button>
      {/each}
    </div>

    {#if recapPhrase}
      <p class="mt-4 text-center text-sm font-medium text-foreground/80 italic">
        {recapPhrase}
      </p>
    {/if}

    <div class="mt-6 flex justify-end">
      <Button type="submit" disabled={!canSubmit} class="px-6">Suivant</Button>
    </div>
  </form>
</div>
