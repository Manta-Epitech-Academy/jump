<script module lang="ts">
  import type { LevelTone } from '$lib/domain/xp';

  // Each level's colour, from the tone its row in `domain/xp.ts` gives it (the
  // badge reads the same tone). The bar takes the raw accent. The top level's
  // near-black is `foreground`, which inverts on dark where `epi-dark` would
  // vanish. Literal classes, so Tailwind keeps them.
  const TONE_FILL: Record<LevelTone, string> = {
    tech: 'bg-epi-tech',
    together: 'bg-epi-together',
    tomorrow: 'bg-epi-tomorrow',
    blue: 'bg-epi-blue',
    dark: 'bg-foreground',
  };
</script>

<script lang="ts">
  import { Card } from '$lib/components/ui/card';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import LevelBadge from '$lib/components/talent/LevelBadge.svelte';
  import { levelProgress, levelToNext } from '$lib/domain/xp';
  import { cn } from '$lib/utils';

  // A talent's Jump level at the head of Mon parcours, as the 2027 mockup draws
  // it: the badge, the level's name, the bar, the XP earned and the next level.
  // The total counts every XP, the ones earned outside an event too, which the
  // journey below does not list. The home shows the level in its own card
  // (`XpCard`).
  let { xp, class: className }: { xp: number; class?: string } = $props();

  const progress = $derived(levelProgress(xp));
  const fr = (n: number) => n.toLocaleString('fr-FR');
</script>

<Card
  class={cn('flex-row flex-wrap items-center gap-6 p-6 sm:gap-8', className)}
>
  <LevelBadge
    level={progress.level}
    tone={progress.tone}
    decorative
    class="h-24 sm:h-26"
  />
  <div class="flex min-w-0 flex-[1_1_16rem] flex-col gap-3">
    <h2 class="font-heading text-display-xl text-foreground">
      {progress.level}<TitleCursor />
    </h2>
    <div
      class="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={levelToNext(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress.ratio * 100)}
    >
      <div
        class={cn(
          'h-full w-(--level-progress) rounded-full',
          TONE_FILL[progress.tone],
        )}
        style:--level-progress="{progress.ratio * 100}%"
      ></div>
    </div>
    <p
      class="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground"
    >
      <span
        ><strong class="font-bold text-foreground">{fr(xp)} XP</strong> gagnés</span
      >
      {#if progress.next}
        <span
          >Prochain niveau : <strong class="font-bold text-foreground"
            >{progress.next.level}</strong
          >
          à {fr(progress.next.min)} XP</span
        >
      {:else}
        <span>Niveau maximum atteint</span>
      {/if}
    </p>
  </div>
</Card>
