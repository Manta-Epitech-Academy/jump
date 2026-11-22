<script module lang="ts">
  import type { LevelTone } from '#lib/domain/xp.ts';

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
  import { Card } from '#lib/components/ui/card/index.ts';
  import TitleCursor from '#lib/components/layout/TitleCursor.svelte';
  import LevelBadge from '#lib/components/talent/LevelBadge.svelte';
  import { levelLadder, levelProgress, levelToNext } from '#lib/domain/xp.ts';
  import { cn } from '#lib/utils.ts';

  // A talent's Jump level at the head of Mon parcours: the badge, the level's
  // name and line, the bar, the XP earned and what is left to the next one,
  // then the five levels in a row, so the way ahead is in sight rather than
  // behind a button. The reached ones in colour, the current one marked, the
  // others faded but in their own colour, as the mockup draws them: a talent
  // sees Maker will be coral and Hacker magenta, a goal one can picture, where
  // five grey hexagons all looked alike. Nothing hides on hover: talents
  // are on a phone. The total counts every XP, those earned outside an event
  // too, which the journey below does not list. The home shows the level in
  // its own card (`XpCard`).
  let { xp, class: className }: { xp: number; class?: string } = $props();

  const progress = $derived(levelProgress(xp));
  const ladder = levelLadder();
  const fr = (n: number) => n.toLocaleString('fr-FR');
</script>

<Card class={cn('gap-6 p-6', className)}>
  <div class="flex flex-wrap items-center gap-6 sm:gap-8">
    <LevelBadge
      level={progress.level}
      tone={progress.tone}
      decorative
      class="h-24 sm:h-26"
    />
    <div class="flex min-w-0 flex-[1_1_16rem] flex-col gap-3">
      <div>
        <h2 class="font-heading text-display-xl text-foreground">
          {progress.level}<TitleCursor />
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">{progress.tagline}</p>
      </div>
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
        <span>{levelToNext(progress)}</span>
      </p>
    </div>
  </div>

  <ol
    class="relative grid grid-cols-5 border-t border-border pt-5"
    aria-label="Les niveaux"
  >
    {#each ladder as step (step.level)}
      {@const reached = xp >= step.min}
      {@const current = step.level === progress.level}
      <li
        class="flex flex-col items-center gap-1 text-center"
        aria-current={current ? 'step' : undefined}
      >
        <LevelBadge
          level={step.level}
          tone={step.tone}
          decorative
          class={cn('h-9', !reached && 'opacity-30')}
        />
        <span
          class={cn(
            'text-xs',
            current
              ? 'font-bold text-foreground'
              : reached
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {step.level}
        </span>
        <span class="text-xs text-muted-foreground">
          {fr(step.min)} XP
        </span>
      </li>
    {/each}
  </ol>
</Card>
