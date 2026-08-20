<script lang="ts">
  import type { ChatRole } from '$lib/domain/feedbackForms/conversation.svelte';
  import { typesetChat } from '$lib/domain/feedbackForms/schema';
  import { cn } from '$lib/utils';

  interface Props {
    role: ChatRole;
    text: string;
    time: string;
  }

  let { role, text, time }: Props = $props();

  const isBot = $derived(role === 'bot');
  // No-break space before French punctuation and before a trailing emoji, so
  // neither a lone "?" nor a lone emoji ever wraps onto its own line.
  const display = $derived(typesetChat(text));
</script>

<div
  class={cn(
    'bubble flex max-w-[85%] flex-col gap-0.5',
    isBot ? 'items-start self-start' : 'items-end self-end',
  )}
>
  <div
    class={cn(
      'rounded-xl px-4 py-2.5 text-sm leading-relaxed shadow-raised',
      isBot
        ? 'rounded-bl-sm border border-border bg-card text-foreground'
        : 'rounded-br-sm bg-epi-blue text-white',
    )}
  >
    {display}
  </div>
  <span class="font-mono text-xs opacity-55">{time}</span>
</div>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .bubble {
      animation: pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.85) translateY(6px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
