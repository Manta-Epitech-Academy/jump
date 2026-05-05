<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
  import type { SlotStatus } from '$lib/domain/presences';

  let { status, class: className }: { status: SlotStatus; class?: string } =
    $props();

  const labels: Record<SlotStatus, string> = {
    live: 'En cours',
    upcoming: 'À venir',
    past: 'Terminé',
  };
</script>

{#if status === 'live'}
  <Badge
    variant="default"
    class={cn('relative bg-epi-blue text-white hover:bg-epi-blue', className)}
  >
    <span
      class="mr-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-white"
    ></span>
    {labels.live}
  </Badge>
{:else if status === 'upcoming'}
  <Badge variant="outline" class={className}>{labels.upcoming}</Badge>
{:else}
  <Badge variant="secondary" class={className}>{labels.past}</Badge>
{/if}
