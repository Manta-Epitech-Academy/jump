<script lang="ts">
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import User from '@lucide/svelte/icons/user';
  import { formatDateTimeFr } from '$lib/utils';

  type Message = {
    id: string;
    body: string;
    createdAt: string;
    side: 'admin' | 'author';
    author: {
      name: string | null;
      email: string;
    };
  };

  let {
    messages,
    viewSide,
  }: {
    messages: Message[];
    viewSide: 'admin' | 'author';
  } = $props();
</script>

<div class="space-y-4">
  {#each messages as message}
    {@const mine = message.side === viewSide}
    <div class="flex gap-3 {mine ? 'flex-row-reverse' : ''}">
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {message.side ===
        'admin'
          ? 'bg-epi-pink/10 text-epi-pink'
          : 'bg-muted text-muted-foreground'}"
      >
        {#if message.side === 'admin'}
          <ShieldAlert class="h-4 w-4" />
        {:else}
          <User class="h-4 w-4" />
        {/if}
      </div>
      <div class="flex max-w-[75%] flex-col gap-1 {mine ? 'items-end' : ''}">
        <div
          class="flex items-center gap-2 text-xs text-muted-foreground {mine
            ? 'flex-row-reverse'
            : ''}"
        >
          <span class="font-bold">
            {message.author.name ?? message.author.email}
          </span>
          <span>{formatDateTimeFr(message.createdAt)}</span>
        </div>
        <div
          class="rounded-md px-3 py-2 text-sm whitespace-pre-wrap {mine
            ? 'bg-primary/10 text-foreground'
            : 'bg-muted text-foreground'}"
        >
          {message.body}
        </div>
      </div>
    </div>
  {/each}
</div>
