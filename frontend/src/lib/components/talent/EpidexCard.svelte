<script lang="ts">
  import { Card } from '#lib/components/ui/card/index.ts';
  import BadgeSticker from '#lib/components/talent/BadgeSticker.svelte';
  import { useMascot } from '#lib/components/mascot/mascotController.svelte.ts';
  import type { BadgeCollection } from '#lib/domain/badges.ts';
  import { cn } from '#lib/utils.ts';

  // « Mon Epidex », the talent's badge collection on Mon parcours, as the 2027
  // mockup draws it (#551): how many they hold out of how many there are, and
  // every badge in the PO's order, earned ones in colour, the others as a
  // silhouette under their name. Nothing else is written on it: a click asks
  // the talent's duck, who says what the badge is for, earned or still to
  // earn, in the PO's words or by its condition. The page is the collection,
  // the duck is its voice.
  let { collection }: { collection: BadgeCollection } = $props();

  const titleId = $props.id();
  const mascot = useMascot();

  function ask(badge: BadgeCollection['badges'][number]) {
    mascot()?.explain({
      key: badge.key,
      moment: badge.earnedOn ? 'badgeEarned' : 'badgeToEarn',
      lines: badge.lines,
      condition: badge.condition,
      tokens: { badge: badge.label, date: badge.earnedOn ?? undefined },
    });
  }
</script>

<Card class="gap-3 p-6" role="region" aria-labelledby={titleId}>
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 id={titleId} class="epi-overline text-muted-foreground">Mon Epidex</h2>
    <p class="font-mono text-overline font-bold text-foreground">
      {collection.earned} / {collection.badges.length}
      <span class="sr-only">badges obtenus</span>
    </p>
  </div>

  <!-- Not bounded in a box of its own (`ui.md`, lists whose length data
       decides), for the reason `ParcoursTimeline` gives: the collection is read
       whole, as the mockup lays it out, and nothing follows it in its card.
       The PO writes its badges by the score, not by the hundred. -->
  <ul
    class="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2"
    aria-label="Mes badges"
  >
    {#each collection.badges as badge (badge.key)}
      <li>
        <button
          type="button"
          class="flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl px-1 pt-2.5 pb-2"
          aria-label={`${badge.label}, ${badge.earnedOn ? `obtenu en ${badge.earnedOn}` : 'à obtenir'} : demande à ton canard`}
          onclick={() => ask(badge)}
        >
          <BadgeSticker
            badgeKey={badge.key}
            art={badge.art}
            earned={badge.earnedOn !== null}
          />
          <span
            class={cn(
              'text-center text-xs leading-tight font-bold',
              badge.earnedOn ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {badge.label}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</Card>
