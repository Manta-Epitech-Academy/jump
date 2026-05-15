<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import Laptop from '@lucide/svelte/icons/laptop';
  import MonitorX from '@lucide/svelte/icons/monitor-x';

  let { bringPc }: { bringPc: boolean } = $props();
</script>

{#if bringPc}
  <button type="submit" class="cursor-pointer">
    <Badge
      variant="outline"
      class="h-4 border-purple-200 bg-purple-50 px-1 py-0 text-[9px] text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
    >
      <Laptop class="mr-1 h-2 w-2" /> Apporte son PC
    </Badge>
  </button>
{:else}
  <button type="submit" class="cursor-pointer">
    <Badge
      variant="outline"
      class="h-4 border-epi-teal-solid/30 bg-epi-teal-solid/10 px-1 py-0 text-[9px] text-epi-teal-solid transition-colors hover:bg-epi-teal-solid/15"
    >
      <MonitorX class="mr-1 h-2 w-2" /> PC à préparer
    </Badge>
  </button>
{/if}
