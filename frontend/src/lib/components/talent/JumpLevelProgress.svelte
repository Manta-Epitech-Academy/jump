<script module lang="ts">
  import type { LevelTone } from '$lib/domain/xp';

  // Each level's colour, from the tone its row in `domain/xp.ts` gives it (the
  // badge reads the same tone). The name takes the ink, legible on light and
  // dark; the bar takes the raw accent. The top level's near-black is
  // `foreground`, which inverts on dark where `epi-dark` would vanish. Literal
  // classes, so Tailwind keeps them.
  const TONE_COLOR: Record<LevelTone, { text: string; fill: string }> = {
    tech: { text: 'text-epi-tech-ink', fill: 'bg-epi-tech' },
    together: { text: 'text-epi-together-ink', fill: 'bg-epi-together' },
    tomorrow: { text: 'text-epi-tomorrow-ink', fill: 'bg-epi-tomorrow' },
    blue: { text: 'text-primary', fill: 'bg-epi-blue' },
    dark: { text: 'text-foreground', fill: 'bg-foreground' },
  };
</script>

<script lang="ts">
  import { levelProgress, levelToNext } from '$lib/domain/xp';
  import { cn } from '$lib/utils';

  // A talent's Jump level and the way to the next one, as the hero of Mon
  // parcours: the name as the hero's heading, its line, the bar, the XP left.
  // The home shows the level in its own card (`XpCard`); the restyle of Mon
  // parcours (#445) starts from here.
  let { xp, class: className }: { xp: number; class?: string } = $props();

  let progress = $derived(levelProgress(xp));
  let color = $derived(TONE_COLOR[progress.tone]);
  let toNext = $derived(levelToNext(progress));
</script>

<div class={cn('flex min-w-0 flex-col gap-1.5', className)}>
  <h2 class={cn('text-base font-bold', color.text)}>{progress.level}</h2>
  <p class="text-sm text-muted-foreground">{progress.tagline}</p>
  <div
    class="h-2 w-full overflow-hidden rounded-full bg-muted"
    role="progressbar"
    aria-label={toNext}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(progress.ratio * 100)}
  >
    <div
      class={cn('h-full w-[var(--level-progress)] rounded-full', color.fill)}
      style:--level-progress="{progress.ratio * 100}%"
    ></div>
  </div>
  <p class="text-xs font-semibold text-muted-foreground">{toNext}</p>
</div>
