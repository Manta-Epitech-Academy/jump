<script lang="ts">
  import { fly } from 'svelte/transition';
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

  // svelte-ignore state_referenced_locally
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

  // IKEA effect: build a recap phrase from selections (in click order)
  const byId = $derived(new Map(interests.map((i) => [i.id, i])));
  const recapPhrase = $derived.by(() => {
    if (count === 0) return '';
    const names = [...selected]
      .map((id) => byId.get(id))
      .filter((i): i is (typeof interests)[number] => i !== undefined)
      .map((i) => `${i.emoji ?? ''} ${i.nom}`.trim());
    if (kind === 'tech') {
      return `Tu es attiré par ${names.join(' et ')}`;
    }
    if (names.length === 1) return `Tu aimes ${names[0]}`;
    const last = names.pop();
    return `Tu aimes ${names.join(', ')} et ${last}`;
  });

  const title = $derived(
    kind === 'tech'
      ? "Qu'est-ce qui t'attire en informatique ?"
      : 'Et en dehors du code ?',
  );

  const subtitle = $derived(
    kind === 'tech'
      ? `Choisis 1 ou 2 domaines qui t'intéressent.`
      : `Choisis entre 1 et 5 sujets qui te passionnent.`,
  );
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    {#if kind === 'tech'}
      <Code class="h-6 w-6" />
    {:else}
      <Sparkles class="h-6 w-6" />
    {/if}
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    {title}
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
</div>

{#if error}
  <p
    class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
  >
    {error}
  </p>
{/if}

<form method="POST" action="?/{actionName}" use:enhance>
  {#each [...selected] as id}
    <input type="hidden" name="interestIds" value={id} />
  {/each}

  <div class="flex flex-wrap gap-2">
    {#each shuffled as interest, index (interest.id)}
      {@const isSelected = selected.has(interest.id)}
      <button
        type="button"
        in:fly={{ y: 15, duration: 300, delay: index * 50 }}
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

  <Button
    type="submit"
    disabled={!canSubmit}
    class="mt-6 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Continuer
  </Button>
</form>
