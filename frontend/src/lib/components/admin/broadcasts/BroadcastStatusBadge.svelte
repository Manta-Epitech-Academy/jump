<script lang="ts" module>
  import type { BroadcastStatus } from '@prisma/client';

  // Square, flat tone chips per the DS (no rounded-full). One source of truth
  // for the broadcast-status colour, paired with BROADCAST_STATUS_LABELS.
  const TONE: Record<BroadcastStatus, string> = {
    queued: 'bg-muted text-muted-foreground',
    sending: 'bg-epi-blue/10 text-epi-blue',
    sent: 'bg-epi-teal-solid/10 text-epi-teal-solid',
    partial_failed: 'bg-epi-orange/10 text-epi-orange',
    failed: 'bg-destructive/10 text-destructive',
  };
</script>

<script lang="ts">
  import { BROADCAST_STATUS_LABELS } from '$lib/domain/broadcasts';
  import { cn } from '$lib/utils';

  let {
    status,
    class: extraClass,
  }: { status: BroadcastStatus; class?: string } = $props();
</script>

<span
  class={cn(
    'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase',
    TONE[status],
    extraClass,
  )}
>
  {BROADCAST_STATUS_LABELS[status]}
</span>
