<script lang="ts">
  import Code from '@lucide/svelte/icons/code';
  import Heart from '@lucide/svelte/icons/heart';
  import type { Snippet } from 'svelte';

  // The talent is the star of the fiche, and what they're into is the most
  // human part of that, so interests get a generous tech / perso split (mirrors
  // the onboarding interests step) rather than one timid flat list.
  type InterestRow = {
    interest: {
      id: string;
      nom: string;
      emoji: string | null;
      kind?: string | null;
    };
  };

  let { interests }: { interests: InterestRow[] } = $props();

  const tech = $derived(interests.filter((i) => i.interest.kind === 'tech'));
  // Everything that isn't explicitly tech reads as "perso" (general + legacy).
  const perso = $derived(interests.filter((i) => i.interest.kind !== 'tech'));
</script>

{#snippet group(
  label: string,
  accentClass: string,
  icon: Snippet,
  rows: InterestRow[],
)}
  {#if rows.length > 0}
    <section class="space-y-2">
      <h3 class="flex items-center gap-1.5 epi-overline {accentClass}">
        {@render icon()}
        {label}
      </h3>
      <div class="flex flex-wrap gap-2">
        {#each rows as ti (ti.interest.id)}
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm font-medium text-foreground"
          >
            {#if ti.interest.emoji}<span aria-hidden="true"
                >{ti.interest.emoji}</span
              >{/if}
            {ti.interest.nom}
          </span>
        {/each}
      </div>
    </section>
  {/if}
{/snippet}

{#snippet techIcon()}
  <Code class="h-3 w-3 text-epi-tech-ink" />
{/snippet}
{#snippet persoIcon()}
  <Heart class="h-3 w-3 text-epi-together" />
{/snippet}

<div class="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
  {@render group('Tech', 'text-epi-tech-ink', techIcon, tech)}
  {@render group('Perso', 'text-epi-together', persoIcon, perso)}
</div>
