<script lang="ts">
  import type { InterviewRecommendation } from '@prisma/client';
  import {
    INTERVIEW_RECOMMENDATIONS,
    type RecommendationToneToken,
  } from '$lib/domain/interview';
  import { cn } from '$lib/utils';

  type Props = {
    value: InterviewRecommendation | null | undefined;
    /** "short" uses the abbreviated label; "full" the long-form */
    variant?: 'short' | 'full';
    /** Smaller chip when in dense rows. */
    size?: 'sm' | 'md';
    class?: string;
  };

  let {
    value,
    variant = 'short',
    size = 'sm',
    class: cls = '',
  }: Props = $props();

  let descriptor = $derived(value ? INTERVIEW_RECOMMENDATIONS[value] : null);

  // Each token maps onto its namesake brand color so the chip's identity
  // stays consistent if one of the recommendation values is renamed —
  // `epi-tomorrow` always renders as `--epi-pink`, never as raw fuchsia.
  const TONE_CLASSES: Record<RecommendationToneToken, string> = {
    'epi-tech':
      'border-epi-teal-solid/30 bg-epi-teal-solid/10 text-epi-teal-solid',
    'epi-blue': 'border-epi-blue/30 bg-epi-blue/10 text-epi-blue',
    'epi-tomorrow': 'border-epi-pink/30 bg-epi-pink/10 text-epi-pink',
    'epi-drift': 'border-border bg-muted text-muted-foreground',
  };
</script>

{#if descriptor}
  <span
    class={cn(
      'inline-flex items-center gap-1 rounded-sm border font-bold tracking-widest whitespace-nowrap uppercase',
      size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]',
      TONE_CLASSES[descriptor.tone],
      cls,
    )}
    title={descriptor.label}
  >
    {variant === 'short' ? descriptor.short : descriptor.label}
  </span>
{/if}
