<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';

  let { onclick }: { onclick: () => void } = $props();
</script>

<Button
  variant="ghost"
  {onclick}
  class="mb-4 h-auto gap-1.5 px-2 py-1 text-sm font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
>
  <ArrowLeft class="h-4 w-4" />
  Retour
</Button>
