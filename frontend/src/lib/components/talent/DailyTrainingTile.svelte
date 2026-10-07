<script lang="ts">
  import { resolve } from '$app/paths';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Trophy from '@lucide/svelte/icons/trophy';
  import { cn } from '$lib/utils';

  // The day's brain training, as one tile among the talent's own cards (XP,
  // next session) rather than a section of its own: being on the home already
  // says « today », so the tile names the training once, the game and its
  // level, and what there is to do about it. The whole tile is the link: to
  // the game before playing, to its leaderboard after.
  //
  // A day without a training renders nothing at all, which the home handles by
  // not mounting this: an empty tile would only fill space.
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

  const game = $derived(
    `${publication.gameName} · niveau ${publication.level}`,
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
      playable: 'text-epi-blue',
      won: 'text-epi-tech-ink',
      lost: 'text-warning',
    }[outcome],
  );
</script>

<a
  {href}
  class="group @container block cursor-pointer rounded-xl border border-border bg-card px-6 py-4 shadow-raised transition-ui hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99]"
>
  <div class="flex flex-col gap-3 @sm:flex-row @sm:items-center @sm:gap-4">
    <div class="flex min-w-0 flex-1 items-start gap-3">
      <Gamepad2 class={cn('mt-0.5 size-4 shrink-0', tone)} aria-hidden="true" />
      <div class="min-w-0">
        <h2 class="text-sm font-bold text-foreground">Entraîne ton cerveau</h2>
        {#if outcome === 'playable'}
          <p class="mt-1 text-sm text-foreground-secondary">{game}</p>
        {:else}
          <p class="mt-1 text-sm text-foreground-secondary">
            {#if outcome === 'won'}
              <span class="font-semibold">Défi relevé</span>{#if result}<span
                  class="text-muted-foreground"
                >
                  · {result}</span
                >{/if}
            {:else}
              <span class="font-semibold">Pas validé</span><span
                class="text-muted-foreground"
              >
                · retente demain</span
              >
            {/if}
          </p>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">{game}</p>
        {/if}
      </div>
    </div>

    {#if outcome === 'playable'}
      <span
        class="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl bg-epi-blue px-4 py-2 text-sm font-bold text-white"
      >
        Jouer
        <ArrowRight
          class="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    {:else}
      <span
        class={cn(
          'inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold',
          tone,
        )}
      >
        <Trophy class="size-4" aria-hidden="true" />
        Classement
      </span>
    {/if}
  </div>
</a>
