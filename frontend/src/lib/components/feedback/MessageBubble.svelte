<script lang="ts">
  import type { ChatRole } from '$lib/domain/feedbackForms/conversation.svelte';
  import { typeset } from '$lib/domain/typography';
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
  const display = $derived(typeset(text));
</script>

<div
  class={cn(
    'bubble flex max-w-[85%] flex-col gap-0.5',
    isBot
      ? 'origin-bottom-left items-start self-start'
      : 'origin-bottom-right items-end self-end',
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
  /* A bubble grows from its tail, the corner it was said from. No overshoot:
     bubbles arrive one after another all along a form, and the brand does not
     bounce (DESIGN.md § Motion). Asked for less motion, it only fades in. */
  .bubble {
    animation: bubble-in var(--dur-base) var(--motion-ease-standard);
  }
  @media (prefers-reduced-motion: reduce) {
    .bubble {
      animation-name: bubble-fade;
    }
  }
  @keyframes bubble-in {
    from {
      opacity: 0;
      transform: scale(0.96) translateY(6px);
    }
  }
  @keyframes bubble-fade {
    from {
      opacity: 0;
    }
  }
</style>
