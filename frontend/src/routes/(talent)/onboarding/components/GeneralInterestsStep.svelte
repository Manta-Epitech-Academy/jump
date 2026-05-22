<script lang="ts">
  import { fly } from 'svelte/transition';
  import { Button } from '$lib/components/ui/button';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  let {
    interests,
    selectedIds = [],
    onvalidate,
  }: {
    interests: { id: string; nom: string; emoji: string | null }[];
    selectedIds?: string[];
    onvalidate: (ids: string[]) => void;
  } = $props();

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffled = $derived.by(() => shuffle(interests));

  // svelte-ignore state_referenced_locally
  let selected = $state(new Set<string>(selectedIds));
  const canSubmit = $derived(selected.size >= 1);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < 3) next.add(id);
    selected = next;
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (canSubmit) onvalidate([...selected]);
  }
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <Sparkles class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Et en dehors du code ?
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Choisis entre 1 et 3 sujets qui te passionnent.
  </p>
</div>

<form onsubmit={handleSubmit} class="space-y-4">
  <div class="flex flex-wrap gap-2 p-1">
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
        {#if interest.emoji}<span>{interest.emoji}</span>{/if}
        <span>{interest.nom}</span>
      </button>
    {/each}
  </div>

  <Button
    type="submit"
    disabled={!canSubmit}
    class="mt-6 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Continuer
  </Button>
</form>
