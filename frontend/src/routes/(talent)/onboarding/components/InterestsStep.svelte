<script lang="ts">
  import { fly } from 'svelte/transition';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import Code from '@lucide/svelte/icons/code';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ContinueButton from './ContinueButton.svelte';

  const TECH_MAX = 2;
  const GENERAL_MAX = 3;

  let {
    techInterests,
    generalInterests,
    selectedTechIds = [],
    selectedGeneralIds = [],
    freeText = '',
    shuffleSeed = '',
    error,
  }: {
    techInterests: { id: string; nom: string; emoji: string | null }[];
    generalInterests: { id: string; nom: string; emoji: string | null }[];
    selectedTechIds?: string[];
    selectedGeneralIds?: string[];
    freeText?: string;
    shuffleSeed?: string;
    error?: string;
  } = $props();

  // FNV-1a hash → a deterministic ordering key per (seed, id). Ordering by it
  // gives a shuffle that's stable for one student across reloads (same seed) yet
  // differs across the cohort, so the chip layout stops jumping on refresh while
  // still avoiding a fixed first-listed bias.
  function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededShuffle<T extends { id: string }>(
    arr: T[],
    seed: string,
  ): T[] {
    return [...arr].sort((a, b) => hashStr(seed + a.id) - hashStr(seed + b.id));
  }

  const shuffledTech = $derived(seededShuffle(techInterests, shuffleSeed));
  const shuffledGeneral = $derived(
    seededShuffle(generalInterests, shuffleSeed),
  );

  // svelte-ignore state_referenced_locally
  let techSelected = $state(new Set<string>(selectedTechIds));
  // svelte-ignore state_referenced_locally
  let generalSelected = $state(new Set<string>(selectedGeneralIds));

  const canSubmit = $derived(
    techSelected.size >= 1 && generalSelected.size >= 1,
  );
  const techFull = $derived(techSelected.size >= TECH_MAX);
  const generalFull = $derived(generalSelected.size >= GENERAL_MAX);

  let submitting = $state(false);

  // Toggle a chip, capping the selection at its max. At the limit, unselected
  // chips are disabled (see markup) rather than silently evicting an earlier
  // pick — the limit stays visible and the user explicitly deselects to swap.
  function toggleTech(id: string) {
    const next = new Set(techSelected);
    if (next.has(id)) next.delete(id);
    else if (next.size < TECH_MAX) next.add(id);
    techSelected = next;
  }

  function toggleGeneral(id: string) {
    const next = new Set(generalSelected);
    if (next.has(id)) next.delete(id);
    else if (next.size < GENERAL_MAX) next.add(id);
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
</div>

{#if error}
  <p
    class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
  >
    {error}
  </p>
{/if}

<form
  method="POST"
  action="?/validateInterests"
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
  class="space-y-6"
>
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
      <span
        class="text-xs font-normal normal-case {techFull
          ? 'text-epi-blue'
          : 'text-slate-400'}">{techSelected.size}/{TECH_MAX}</span
      >
    </h2>
    <div class="flex flex-wrap gap-2">
      {#each shuffledTech as interest, index (interest.id)}
        {@const isSelected = techSelected.has(interest.id)}
        <button
          type="button"
          in:fly={{ y: 15, duration: 300, delay: index * 50 }}
          onclick={() => toggleTech(interest.id)}
          disabled={!isSelected && techFull}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-none border-2 px-3 py-1.5 text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100
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
      <span
        class="text-xs font-normal normal-case {generalFull
          ? 'text-purple-500'
          : 'text-slate-400'}">{generalSelected.size}/{GENERAL_MAX}</span
      >
    </h2>
    <div class="flex flex-wrap gap-2">
      {#each shuffledGeneral as interest, index (interest.id)}
        {@const isSelected = generalSelected.has(interest.id)}
        <button
          type="button"
          in:fly={{ y: 15, duration: 300, delay: index * 50 }}
          onclick={() => toggleGeneral(interest.id)}
          disabled={!isSelected && generalFull}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100
            {isSelected
            ? 'border-purple-500 bg-purple-500/10 text-purple-600 shadow-sm dark:bg-purple-500/20 dark:text-purple-400'
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

  <ContinueButton {submitting} disabled={!canSubmit} class="mt-4" />
</form>
