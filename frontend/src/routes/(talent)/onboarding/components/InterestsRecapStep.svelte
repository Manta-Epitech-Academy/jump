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

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <UserCheck class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Voilà ce qui te décrit
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Tes choix nous aideront à personnaliser ton expérience.
  </p>
</div>

<div class="space-y-5">
  {#if techSelections.length > 0}
    <div
      class="rounded-xl bg-white/70 px-4 py-4 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
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
    <div
      class="rounded-xl bg-white/70 px-4 py-4 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
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
  <Button
    type="submit"
    class="mt-6 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Continuer
  </Button>
</form>
