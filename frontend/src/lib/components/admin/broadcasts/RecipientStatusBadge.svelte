<script lang="ts" module>
  import type { BroadcastRecipientStatus } from '@prisma/client';

  const TONE: Record<BroadcastRecipientStatus, string> = {
    pending: 'bg-muted text-muted-foreground',
    sent: 'bg-epi-teal-solid/10 text-epi-teal-solid',
    failed: 'bg-destructive/10 text-destructive',
  };
</script>

<script lang="ts">
  import { RECIPIENT_STATUS_LABELS } from '$lib/domain/broadcasts';
  import { cn } from '$lib/utils';

  let {
    status,
    class: extraClass,
  }: {
    status: BroadcastRecipientStatus;
    class?: string;
  } = $props();
</script>

<span
  class={cn(
    'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase',
    TONE[status],
    extraClass,
  )}
>
  {RECIPIENT_STATUS_LABELS[status]}
</span>
