<script lang="ts">
  import { resolve } from '$app/paths';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Trophy from '@lucide/svelte/icons/trophy';
  import { cn } from '$lib/utils';
  import { Card } from '$lib/components/ui/card';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  // The day's brain training, as one card among the talent's own (XP, next
  // session) rather than a section of its own: being on the home already says
  // « today », so the card names the training once, then the game (in the
  // 2027 mockup's large title) and its level or today's result, and what there
  // is to do about it. The whole card is the link: to the game before playing,
  // to its leaderboard after.
  //
  // It is training, never play: the PO's word, and the reason the title and
  // the action both say so. And its action is a secondary link, in the
  // tone of its state like « Classement », never a filled button: the home
  // has one action that weighs more than the others, and it is in the hero.
  //
  // A day without a training renders nothing at all, which the home handles by
  // not mounting this: an empty card would only fill space.
  //
  // A finished attempt is either a win (`done`: ranked, XP earned) or a loss
  // (played, no XP, absent from the board). The two must not read alike: a loss
  // shown as « Défi relevé » congratulates a run the talent never got.
  let {
    publication,
    attempt,
  }: {
    publication: { id: string; gameName: string; level: number };
    /** Today's finished attempt, or null while there is still one to play. */
    attempt: {
      status: string;
      score: number | null;
      chrono: number | null;
    } | null;
  } = $props();

  const outcome = $derived(
    attempt === null ? 'playable' : attempt.status === 'done' ? 'won' : 'lost',
  );

  const result = $derived.by(() => {
    if (!attempt) return null;
    const parts = [
      attempt.score !== null ? `${attempt.score} pts` : null,
      attempt.chrono !== null
        ? `${(attempt.chrono / 1000).toFixed(1)} s`
        : null,
    ].filter(Boolean);
    return parts.join(' · ');
  });

  const href = $derived(
    outcome === 'playable'
      ? resolve(`/minigames/${publication.id}`)
      : resolve(`/minigames/${publication.id}/leaderboard`),
  );

  const tone = $derived(
    {
      playable: 'text-primary',
      won: 'text-epi-tech-ink',
      lost: 'text-warning',
    }[outcome],
  );
</script>

<a
  {href}
  class="group block cursor-pointer rounded-xl transition-ui active:translate-y-px"
>
  <Card class="h-full gap-3 p-6 transition-ui group-hover:bg-muted/40">
    <h2 class="epi-overline text-muted-foreground">Entraîner mon cerveau</h2>

    <div class="min-w-0">
      <p class="font-heading text-display-l text-foreground">
        {publication.gameName}<TitleCursor />
      </p>
      <p class="mt-1 text-sm text-foreground-secondary">
        {#if outcome === 'playable'}
          Niveau {publication.level}
        {:else if outcome === 'won'}
          <span class="font-semibold">Défi relevé</span>{#if result}{' '}<span
              class="text-muted-foreground">· {result}</span
            >{/if}
        {:else}
          <span class="font-semibold">Pas validé</span>{' '}<span
            class="text-muted-foreground">· retente demain</span
          >
        {/if}
      </p>
    </div>

    {#if outcome === 'playable'}
      <span
        class={cn('inline-flex items-center gap-1 text-sm font-semibold', tone)}
      >
        C’est parti
        <ArrowRight
          class="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    {:else}
      <span
        class={cn(
          'inline-flex items-center gap-1.5 text-sm font-semibold',
          tone,
        )}
      >
        <Trophy class="size-4" aria-hidden="true" />
        Classement
      </span>
    {/if}
  </Card>
</a>
