<script lang="ts">
  import type { ChatRole } from '$lib/domain/feedbackForms/conversation.svelte';
  import { cn } from '$lib/utils';

  interface Props {
    role: ChatRole;
    text: string;
    time: string;
  }

  let { role, text, time }: Props = $props();

  const isBot = $derived(role === 'bot');
</script>

<div
  class={cn(
    'bubble flex max-w-[85%] flex-col gap-0.5',
    isBot ? 'items-start self-start' : 'items-end self-end',
  )}
>
  <div
    class={cn(
      'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
      isBot
        ? 'rounded-bl-sm border border-slate-200 bg-white text-foreground dark:border-slate-700 dark:bg-slate-800'
        : 'rounded-br-sm bg-epi-blue text-white',
    )}
  >
    {text}
  </div>
  <span class="font-mono text-[10px] opacity-55">{time}</span>
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
