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

  const TONE_CLASSES: Record<RecommendationToneToken, string> = {
    'epi-tech': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'epi-blue': 'bg-blue-50 text-epi-blue border-blue-200',
    'epi-tomorrow': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    'epi-drift': 'bg-muted text-muted-foreground border-border',
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
