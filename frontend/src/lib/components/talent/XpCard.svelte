<!--
  The talent's XP on the home, and the way into « Mon parcours », where
  everything the home no longer lists lives: the activities left to do (counted
  on the pill), the finished ones, the events attended, the XP history.

  Drawn as the 2027 mockup's « Mon parcours » card: the total, the level Jump
  computes from it (`levelProgress`, whatever the levels are) with its badge,
  and how far along to the next one. The whole card is the link.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { Card } from '$lib/components/ui/card';
  import LevelBadge from '$lib/components/talent/LevelBadge.svelte';
  import { levelProgress } from '$lib/domain/xp';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  let { xp, toDoCount }: { xp: number; toDoCount: number } = $props();

  const progress = $derived(levelProgress(xp));
  const fr = (n: number) => n.toLocaleString('fr-FR');

  // The bar is drawn for the eye; this sentence is what it says.
  const toNext = $derived(
    progress.next
      ? `Encore ${fr(progress.next.min - xp)} XP avant le niveau ${progress.next.level}`
      : 'Tu as atteint le plus haut niveau',
  );
</script>

<a
  href={resolve('/parcours')}
  class="group block cursor-pointer rounded-xl transition-ui active:translate-y-px"
>
  <Card class="h-full gap-4 p-6 transition-ui group-hover:bg-muted/40">
    <h2 class="epi-overline text-muted-foreground">Mon parcours</h2>

    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0">
        <p class="font-heading text-display-xl text-foreground">
          {fr(xp)}<span
            class="ml-1 font-sans text-base font-bold text-epi-together-ink"
            >XP</span
          >
        </p>
        <p class="mt-1 font-bold text-foreground">{progress.level}</p>
      </div>
      <LevelBadge level={progress.level} tone={progress.tone} />
    </div>

    <div
      class="h-2 w-full overflow-hidden rounded-full bg-muted"
      aria-hidden="true"
    >
      <div
        class="h-full w-(--progress) rounded-full bg-primary"
        style:--progress="{Math.round(progress.ratio * 100)}%"
      ></div>
    </div>
    <span class="sr-only">{toNext}.</span>

    <span
      class="inline-flex items-center gap-1.5 self-start rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary transition-ui group-hover:bg-primary/20"
    >
      Profil complet
      {#if toDoCount > 0}
        <span
          class="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground"
          aria-hidden="true">{toDoCount}</span
        >
        <span class="sr-only">
          , {toDoCount}
          {toDoCount > 1 ? 'activités' : 'activité'} à faire
        </span>
      {/if}
      <ArrowRight
        class="size-4 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </span>
  </Card>
</a>
