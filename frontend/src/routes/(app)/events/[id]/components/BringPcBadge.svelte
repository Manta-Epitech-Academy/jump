<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Laptop, MonitorX } from 'lucide-svelte';

  let { bringPc }: { bringPc: boolean } = $props();
</script>

{#if bringPc}
  <button type="submit" class="cursor-pointer">
    <Badge
      variant="outline"
      class="h-4 border-purple-200 bg-purple-50 px-1 py-0 text-[9px] text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
    >
      <Laptop class="mr-1 h-2 w-2" /> Avec PC
    </Badge>
  </button>
{:else}
  <button type="submit" class="cursor-pointer">
    <Badge
      variant="outline"
      class="h-4 border-orange-200 bg-orange-50 px-1 py-0 text-[9px] text-orange-700 transition-colors hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50"
    >
      <MonitorX class="mr-1 h-2 w-2" /> Besoin PC
    </Badge>
  </button>
{/if}
