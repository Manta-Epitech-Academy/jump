<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import UserCheck from '@lucide/svelte/icons/user-check';

  let {
    techSelections,
    generalSelections,
  }: {
    techSelections: { nom: string; emoji: string | null }[];
    generalSelections: { nom: string; emoji: string | null }[];
  } = $props();
</script>

<div
  class="rounded-xl border border-slate-200 bg-white p-6 shadow-lg md:p-8 dark:border-slate-800 dark:bg-slate-900"
>
  <div class="mb-6 flex flex-col items-center gap-2">
    <div
      class="flex h-12 w-12 items-center justify-center rounded-full bg-epi-teal/10 text-epi-teal"
    >
      <UserCheck class="h-6 w-6" />
    </div>
    <h1 class="text-xl font-bold text-foreground">Voici ce qui te décrit</h1>
    <p class="text-center text-sm text-muted-foreground">
      Tes choix nous aideront à personnaliser ton expérience.
    </p>
  </div>

  <div class="space-y-5">
    {#if techSelections.length > 0}
      <div>
        <p
          class="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Ce qui t'attire en informatique
        </p>
        <div class="flex flex-wrap gap-2">
          {#each techSelections as interest}
            <span
              class="inline-flex items-center gap-1.5 rounded-full border-2 border-epi-blue bg-epi-blue/10 px-3 py-1.5 text-sm font-medium text-epi-blue dark:bg-epi-blue/20"
            >
              {#if interest.emoji}<span>{interest.emoji}</span>{/if}
              <span>{interest.nom}</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    {#if generalSelections.length > 0}
      <div>
        <p
          class="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Tes centres d'intérêt
        </p>
        <div class="flex flex-wrap gap-2">
          {#each generalSelections as interest}
            <span
              class="inline-flex items-center gap-1.5 rounded-full border-2 border-epi-blue bg-epi-blue/10 px-3 py-1.5 text-sm font-medium text-epi-blue dark:bg-epi-blue/20"
            >
              {#if interest.emoji}<span>{interest.emoji}</span>{/if}
              <span>{interest.nom}</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <form method="POST" action="?/confirmRecap" use:enhance>
    <div class="mt-6 flex justify-end">
      <Button type="submit" class="px-6">Suivant</Button>
    </div>
  </form>
</div>
