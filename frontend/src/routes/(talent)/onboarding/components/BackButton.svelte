<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';

  let { onclick }: { onclick: () => void } = $props();
</script>

<button
  type="button"
  {onclick}
  class="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
>
  <ArrowLeft class="h-4 w-4" />
  Retour
</button>
