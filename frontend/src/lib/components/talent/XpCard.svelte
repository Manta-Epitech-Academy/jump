<!--
  The talent's XP on the home, and the way into « Mon parcours », where
  everything the home no longer lists lives: the journey event by event, with
  the activities done and those left to do (counted beside its link).

  Drawn as the 2027 mockup's « Mon parcours » card: the total, the level Jump
  computes from it (`levelProgress`, whatever the levels are) with its badge,
  and how far along to the next one. The whole card is the link.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { Card } from '$lib/components/ui/card';
  import LevelBadge from '$lib/components/talent/LevelBadge.svelte';
  import { levelProgress, levelToNext } from '$lib/domain/xp';
  import CardAction from '$lib/components/talent/CardAction.svelte';

  let { xp, toDoCount }: { xp: number; toDoCount: number } = $props();

  const progress = $derived(levelProgress(xp));
  const fr = (n: number) => n.toLocaleString('fr-FR');

  // The bar is drawn for the eye; this sentence is what it says.
  const toNext = $derived(levelToNext(progress));
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
      <LevelBadge level={progress.level} tone={progress.tone} decorative />
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

    <CardAction
      count={toDoCount}
      countLabel="{toDoCount} {toDoCount > 1
        ? 'activités'
        : 'activité'} à faire"
    >
      Profil complet
    </CardAction>
  </Card>
</a>
