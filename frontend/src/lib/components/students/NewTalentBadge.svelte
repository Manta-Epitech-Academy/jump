<script lang="ts">
  import { Sprout } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';

  let { class: className = '' }: { class?: string } = $props();
</script>

<Badge
  variant="outline"
  class={cn(
    'shrink-0 gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400',
    className,
  )}
>
  <Sprout class="h-2.5 w-2.5" />
  Nouveau
</Badge>
