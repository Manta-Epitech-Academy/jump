<script lang="ts">
  import type { BroadcastChannel } from '@prisma/client';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import { BROADCAST_CHANNEL_LABELS } from '$lib/domain/broadcasts';
  import { cn } from '$lib/utils';

  let {
    channel,
    withLabel = true,
    class: extraClass,
  }: {
    channel: BroadcastChannel;
    withLabel?: boolean;
    class?: string;
  } = $props();
</script>

<span class={cn('inline-flex items-center gap-1', extraClass)}>
  {#if channel === 'mail'}
    <Mail class="h-3.5 w-3.5" />
  {:else}
    <MessageSquare class="h-3.5 w-3.5" />
  {/if}
  {#if withLabel}{BROADCAST_CHANNEL_LABELS[channel]}{/if}
</span>
