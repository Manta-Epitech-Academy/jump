<script lang="ts">
  import { resolve } from '$app/paths';
  import { X, UserPen } from '@lucide/svelte';

  let dismissed = $state(false);
</script>

{#if !dismissed}
  <div
    class="relative flex items-center gap-4 rounded-2xl border border-teal-200 bg-teal-50/80 px-5 py-3.5 dark:border-teal-900/40 dark:bg-teal-950/30"
  >
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/40"
    >
      <UserPen class="h-5 w-5 text-teal-600 dark:text-epi-teal" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-bold text-teal-900 dark:text-teal-200">
        Complète ton profil
      </p>
      <p class="text-xs text-teal-600/70 dark:text-teal-400/60">
        Ajoute tes informations pour une expérience personnalisée.
      </p>
    </div>
    <a
      href={resolve('/settings')}
      class="shrink-0 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition-all hover:scale-[1.02] hover:bg-teal-700 active:scale-[0.98] dark:bg-teal-500 dark:hover:bg-teal-600"
    >
      Compléter
    </a>
    <button
      type="button"
      onclick={() => (dismissed = true)}
      class="absolute top-2 right-2 rounded-lg p-1 text-teal-400 transition-colors hover:bg-teal-100 hover:text-teal-600 dark:hover:bg-teal-900/40"
    >
      <X class="h-3.5 w-3.5" />
      <span class="sr-only">Fermer</span>
    </button>
  </div>
{/if}
