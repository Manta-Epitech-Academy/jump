<script lang="ts">
  import Frown from '@lucide/svelte/icons/frown';
  import Meh from '@lucide/svelte/icons/meh';
  import Smile from '@lucide/svelte/icons/smile';
  import Laugh from '@lucide/svelte/icons/laugh';
  import type { ClosingRecommendation } from '@prisma/client';
  import {
    CLOSING_RECOMMENDATIONS,
    type RecommendationIconToken,
    type RecommendationToneToken,
  } from '$lib/domain/closing';
  import { cn } from '$lib/utils';

  /**
   * The team's verdict on a talent, as a compact chip.
   *
   * Always a glyph and a word beside the colour, never the colour alone: the
   * hue carries the valence at a glance, but it cannot be the only thing
   * carrying it. Distinct from the flow's verdict picker, which is a large
   * selectable control rather than a read-out.
   *
   * `epi-tomorrow-ink` rather than the raw accent: at this size the raw one
   * measures 3.10:1 on white, and the ink variant exists at 7.34:1 for exactly
   * this.
   */
  let {
    recommendation,
    short = false,
  }: {
    recommendation: ClosingRecommendation;
    /** Use the abbreviated label, for a dense row. */
    short?: boolean;
  } = $props();

  const TONE: Record<RecommendationToneToken, string> = {
    'epi-tech': 'border-epi-tech-ink/30 bg-epi-tech-ink/10 text-epi-tech-ink',
    'epi-blue': 'border-epi-blue/30 bg-epi-blue/10 text-epi-blue',
    'epi-tomorrow':
      'border-epi-tomorrow-ink/30 bg-epi-tomorrow-ink/10 text-epi-tomorrow-ink',
    'epi-drift': 'border-border bg-muted text-muted-foreground',
  };

  const ICONS: Record<RecommendationIconToken, typeof Frown> = {
    frown: Frown,
    meh: Meh,
    smile: Smile,
    laugh: Laugh,
  };

  const desc = $derived(CLOSING_RECOMMENDATIONS[recommendation]);
  const Face = $derived(ICONS[desc.icon]);
</script>

<span
  class={cn(
    'inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium',
    TONE[desc.tone],
  )}
>
  <Face class="h-3.5 w-3.5 shrink-0" />
  {short ? desc.short : desc.label}
</span>
