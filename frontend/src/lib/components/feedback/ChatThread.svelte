<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ChatMessage } from '$lib/domain/feedbackForms/conversation.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import TypingIndicator from './TypingIndicator.svelte';

  interface Props {
    messages: ChatMessage[];
    typing: boolean;
    replies?: Snippet;
  }

  let { messages, typing, replies }: Props = $props();
  let el: HTMLDivElement | undefined = $state();

  function scrollToBottom() {
    if (el) el.scrollTop = el.scrollHeight;
  }

  $effect(() => {
    // Track reactive deps so we scroll on any change
    void messages.length;
    void typing;
    void replies;
    // Use tick-like delay to let DOM update
    requestAnimationFrame(scrollToBottom);
  });
</script>

<div
  bind:this={el}
  class="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 px-4 py-6 dark:bg-slate-900/50"
>
  {#each messages as msg (msg.id)}
    <MessageBubble role={msg.role} text={msg.text} time={msg.time} />
  {/each}

  {#if typing}
    <TypingIndicator />
  {/if}

  {#if replies}
    {@render replies()}
  {/if}
</div>
