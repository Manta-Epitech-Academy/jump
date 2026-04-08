<script lang="ts">
  import { resolve } from '$app/paths';
  import { X } from '@lucide/svelte';

  let dismissed = $state(false);
</script>

{#if !dismissed}
  <div
    class="relative flex items-center gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/80 px-5 py-3.5 dark:border-indigo-900/40 dark:bg-indigo-950/30"
  >
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40"
    >
      <svg class="h-5 w-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
      </svg>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-bold text-indigo-900 dark:text-indigo-200">
        Relie ton compte Discord
      </p>
      <p class="text-xs text-indigo-600/70 dark:text-indigo-400/60">
        Connecte ton Discord pour rejoindre la communauté.
      </p>
    </div>
    <a
      href={resolve('/camper/discord')}
      class="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-all hover:scale-[1.02] hover:bg-indigo-700 active:scale-[0.98] dark:bg-indigo-500 dark:hover:bg-indigo-600"
    >
      Connecter
    </a>
    <button
      type="button"
      onclick={() => (dismissed = true)}
      class="absolute top-2 right-2 rounded-lg p-1 text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900/40"
    >
      <X class="h-3.5 w-3.5" />
      <span class="sr-only">Fermer</span>
    </button>
  </div>
{/if}
