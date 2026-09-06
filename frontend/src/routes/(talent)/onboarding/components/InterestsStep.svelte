<script lang="ts">
  import { fly } from 'svelte/transition';
  import { enhance } from '$app/forms';
  import { onboardingSubmit } from '../stepSubmit';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import Code from '@lucide/svelte/icons/code';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ContinueButton from './ContinueButton.svelte';
  import { fieldInput } from './fieldSkin';

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
  // pick: the limit stays visible and the user explicitly deselects to swap.
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
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-epi-blue text-white shadow-raised"
  >
    <Sparkles class="h-7 w-7" />
  </div>
  <h1 class="font-heading text-display-m text-epi-blue">
    Tes centres d'intérêt
  </h1>
</div>

{#if error}
  <p
    class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
  >
    {error}
  </p>
{/if}

<form
  method="POST"
  action="?/validateInterests"
  use:enhance={onboardingSubmit((v) => (submitting = v))}
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
      class="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-foreground-secondary uppercase"
    >
      <Code class="h-4 w-4" /> Côté tech
      <span
        class="text-xs font-normal normal-case {techFull
          ? 'text-epi-blue'
          : 'text-muted-foreground'}">{techSelected.size}/{TECH_MAX}</span
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
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-ui hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100
            {isSelected
            ? 'border-epi-blue bg-epi-blue/10 text-epi-blue shadow-raised dark:bg-epi-blue/20'
            : 'border-border bg-card text-foreground-secondary hover:border-border hover:bg-background'}"
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
      class="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-foreground-secondary uppercase"
    >
      <Sparkles class="h-4 w-4" /> Côté perso
      <span
        class="text-xs font-normal normal-case {generalFull
          ? 'text-epi-tomorrow-ink'
          : 'text-muted-foreground'}">{generalSelected.size}/{GENERAL_MAX}</span
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
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-ui hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100
            {isSelected
            ? 'border-epi-tomorrow-ink bg-epi-tomorrow-ink/10 text-epi-tomorrow-ink shadow-raised'
            : 'border-border bg-card text-foreground-secondary hover:border-border hover:bg-background'}"
        >
          {#if interest.emoji}<span>{interest.emoji}</span>{/if}
          <span>{interest.nom}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Champ libre -->
  <div
    class="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-raised"
  >
    <Label
      for="freeText"
      class="mb-1 block text-xs font-medium text-muted-foreground"
    >
      Et sinon, qu'est-ce qui te fait vibrer en ce moment ?
    </Label>
    <Textarea
      id="freeText"
      name="freeText"
      rows={3}
      maxlength={500}
      value={freeText}
      placeholder="Une série, un sport, un projet, n'importe quoi…"
      class="resize-none {fieldInput}"
    />
  </div>

  <ContinueButton {submitting} disabled={!canSubmit} class="mt-4" />
</form>
