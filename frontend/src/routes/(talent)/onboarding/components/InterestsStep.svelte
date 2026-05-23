<script lang="ts">
  import { fly } from 'svelte/transition';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import Code from '@lucide/svelte/icons/code';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  let {
    techInterests,
    generalInterests,
    selectedTechIds = [],
    selectedGeneralIds = [],
    freeText = '',
    error,
  }: {
    techInterests: { id: string; nom: string; emoji: string | null }[];
    generalInterests: { id: string; nom: string; emoji: string | null }[];
    selectedTechIds?: string[];
    selectedGeneralIds?: string[];
    freeText?: string;
    error?: string;
  } = $props();

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffledTech = $derived.by(() => shuffle(techInterests));
  const shuffledGeneral = $derived.by(() => shuffle(generalInterests));

  // svelte-ignore state_referenced_locally
  let techSelected = $state(new Set<string>(selectedTechIds));
  // svelte-ignore state_referenced_locally
  let generalSelected = $state(new Set<string>(selectedGeneralIds));

  const canSubmit = $derived(
    techSelected.size >= 1 && generalSelected.size >= 1,
  );

  function toggleTech(id: string) {
    const next = new Set(techSelected);
    if (next.has(id)) next.delete(id);
    else if (next.size < 2) next.add(id);
    techSelected = next;
  }

  function toggleGeneral(id: string) {
    const next = new Set(generalSelected);
    if (next.has(id)) next.delete(id);
    else if (next.size < 3) next.add(id);
    generalSelected = next;
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
    Tes centres d'intérêt
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Dis-nous ce qui te passionne
  </p>
</div>

{#if error}
  <p
    class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
  >
    {error}
  </p>
{/if}

<form method="POST" action="?/validateInterests" use:enhance class="space-y-6">
  {#each [...techSelected] as id}
    <input type="hidden" name="techInterestIds" value={id} />
  {/each}
  {#each [...generalSelected] as id}
    <input type="hidden" name="generalInterestIds" value={id} />
  {/each}

  <!-- Côté tech -->
  <div>
    <h2
      class="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
    >
      <Code class="h-4 w-4" /> Côté tech
      <span class="text-xs font-normal text-slate-400 normal-case">(2 max)</span
      >
    </h2>
    <div class="flex flex-wrap gap-2">
      {#each shuffledTech as interest, index (interest.id)}
        {@const isSelected = techSelected.has(interest.id)}
        <button
          type="button"
          in:fly={{ y: 15, duration: 300, delay: index * 50 }}
          onclick={() => toggleTech(interest.id)}
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
  </div>

  <!-- Côté perso -->
  <div>
    <h2
      class="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300"
    >
      <Sparkles class="h-4 w-4" /> Côté perso
      <span class="text-xs font-normal text-slate-400 normal-case">(3 max)</span
      >
    </h2>
    <div class="flex flex-wrap gap-2">
      {#each shuffledGeneral as interest, index (interest.id)}
        {@const isSelected = generalSelected.has(interest.id)}
        <button
          type="button"
          in:fly={{ y: 15, duration: 300, delay: index * 50 }}
          onclick={() => toggleGeneral(interest.id)}
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
  </div>

  <!-- Champ libre -->
  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <Label
      for="freeText"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Autre chose à nous dire sur tes centres d'intérêt ?
    </Label>
    <Textarea
      id="freeText"
      name="freeText"
      rows={3}
      maxlength={500}
      value={freeText}
      placeholder="Raconte-nous..."
      class="resize-none rounded-lg border-slate-200 bg-white/70 text-slate-900 placeholder:text-slate-300 focus-visible:border-epi-blue/40 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>

  <Button
    type="submit"
    disabled={!canSubmit}
    class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Continuer
  </Button>
</form>
