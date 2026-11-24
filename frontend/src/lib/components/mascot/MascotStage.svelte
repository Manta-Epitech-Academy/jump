<!--
  The duck's stage (#540): where EpiDuck celebrates what the talent earned, in
  the middle of the screen, drawn large (`atlas="stage"`). One stage for every
  celebration, so two never overlap and each plays once: the XP of each source
  (`activityXp`, `dailyGameXp`…) and, last, a level reached.

  A celebration is a gift, not a receipt, so it has three beats:
    - XP: the amount pops and counts up, the duck hops in with his joy, and
      says the line of its moment;
    - a level: the bar of the level left fills and overflows (the wait), the new
      level's badge and the duck appear (the reveal), confetti and his line (the
      celebration).
  The figures are the code's, the words the admin's (`lineFor`): with no live
  line he is there and says nothing.

  There is one duck. When the stage opens, the header's duck steps out of sight
  (`enterStage`); when it closes, the stage's duck shrinks onto the header's
  spot before the header's comes back (`leaveStage`). A page with no header
  duck fades him out instead.

  It asks nothing: a tap or Escape moves to the next beat. It is marked played
  before it plays (`ackCelebrations`), so leaving mid-animation never replays
  it, and under an admin's impersonation that mark is skipped server-side.

  Less motion asked: no confetti, no hop, no count-up and no flight back; what
  appears fades.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fade } from '#lib/motion/index.ts';
  import { triggerConfetti } from '#lib/actions/confetti.ts';
  import XpFloat from '#lib/components/talent/XpFloat.svelte';
  import LevelBadge from '#lib/components/talent/LevelBadge.svelte';
  import { DEFAULT_MASCOT_LOOK, mascotLookOf } from '#lib/domain/mascot.ts';
  import type {
    Celebration,
    PendingCelebrations,
  } from '#lib/server/talent/celebrations.ts';
  import type { CelebrationAck } from '#lib/validation/celebrations.ts';
  import EpiDuck, { STAGE_ATLAS_URL } from './EpiDuck.svelte';
  import { useMascot } from './mascotController.svelte.ts';
  import { ackCelebrations } from './celebrations.remote';

  let {
    pending = null,
    preload = false,
  }: {
    /** What the page load found owed; new items arrive on revalidation. */
    pending?: PendingCelebrations | null;
    /** Fetch the large duck now: the page is about to `play()` one. */
    preload?: boolean;
  } = $props();

  const mascot = useMascot()();

  /** How long each beat holds the screen. */
  const XP_MS = 2800;
  const LEVEL_FILL_MS = 900;
  const LEVEL_MS = 4800;
  const LANDING_MS = 650;
  /** Lets the page settle before the first beat. */
  const SETTLE_MS = 300;

  /** The kicker over an amount: where it came from, in a word. */
  const XP_LABEL: Record<string, string> = {
    arrivalXp: 'Bienvenue',
    earlyArrivalXp: 'Bienvenue',
    activityXp: 'Activité en cours',
    dailyGameXp: 'Défi relevé !',
    rankXp: 'Top du campus',
  };

  let look = $derived(
    page.data.talent ? mascotLookOf(page.data.talent) : DEFAULT_MASCOT_LOOK,
  );

  let current = $state<Celebration | null>(null);
  /** The level scene's beat: the bar filling, then the level revealed. */
  let revealed = $state(false);
  let barRatio = $state(0);
  let line = $state<string | null>(null);
  let duck = $state<HTMLDivElement>();

  const queue: Celebration[] = [];
  let running = false;
  let skip: (() => void) | null = null;
  let alive = true;

  // What this page already took into the queue, so a revalidation that brings
  // the same rewards back (their mark not yet committed) never plays them
  // twice. Activity XP are compared per activity, as their mark is.
  const seenKeys = new Set<string>();
  const seenActivity = new Map<string, number>();

  /** The items of `pending` this page has not queued yet. */
  function fresh({ items, ack }: PendingCelebrations): Celebration[] {
    return items.filter((item) => {
      if (item.kind === 'xp' && item.moment === 'activityXp') {
        const upTo = ack.workshopUpTo ?? [];
        const isNew = upTo.some(
          ({ activityId, amount }) =>
            amount > (seenActivity.get(activityId) ?? 0),
        );
        for (const { activityId, amount } of upTo) {
          seenActivity.set(activityId, amount);
        }
        return isNew;
      }
      const key = item.kind === 'level' ? `level:${item.level}` : item.moment;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }

  // An effect, not `onMount`: activity XP arrive on a page already mounted,
  // when the talent comes back to the tab and the page revalidates.
  $effect(() => {
    if (!pending) return;
    const items = fresh(pending);
    if (items.length === 0) return;
    void ackCelebrations(pending.ack);
    enqueue(items);
  });

  /**
   * Celebrate something the page witnessed itself, the daily challenge won on
   * the play page, marked played with `ack` first.
   */
  export function play(item: Celebration, ack: CelebrationAck): void {
    void ackCelebrations(ack);
    enqueue([item]);
  }

  function enqueue(items: Celebration[]): void {
    queue.push(...items);
    void run();
  }

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        skip = null;
        resolve();
      }
      skip = done;
    });

  /** The large duck, fetched and decoded, or given up on after a moment. */
  function stageAtlasReady(): Promise<void> {
    const img = new Image();
    img.src = STAGE_ATLAS_URL;
    return Promise.race([
      img.decode().catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 800)),
    ]);
  }

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    await Promise.all([stageAtlasReady(), wait(SETTLE_MS)]);
    mascot?.enterStage();
    while (alive && queue.length > 0) {
      const item = queue.shift()!;
      if (item.kind === 'xp') await showXp(item);
      else await showLevel(item);
    }
    if (alive) await land();
    current = null;
    line = null;
    mascot?.leaveStage();
    running = false;
  }

  async function showXp(item: Extract<Celebration, { kind: 'xp' }>) {
    current = item;
    line =
      mascot?.lineFor({
        moment: item.moment,
        tokens: {
          xp: item.xp.toLocaleString('fr-FR'),
          bonus: item.bonus?.toLocaleString('fr-FR'),
        },
      }) ?? null;
    triggerConfetti();
    hop();
    await wait(XP_MS);
  }

  async function showLevel(item: Extract<Celebration, { kind: 'level' }>) {
    revealed = false;
    barRatio = item.fromRatio;
    line = null;
    current = item;
    // The wait: the bar of the level left fills to its end.
    requestAnimationFrame(() => (barRatio = 1));
    await wait(LEVEL_FILL_MS);
    // The reveal and the celebration.
    revealed = true;
    line =
      mascot?.lineFor({ moment: 'levelUp', tokens: { niveau: item.level } }) ??
      null;
    triggerConfetti();
    hop();
    await wait(LEVEL_MS - LEVEL_FILL_MS);
  }

  /** His hop of joy, the lane's, at the stage's size. */
  function hop(): void {
    if (!duck || prefersReducedMotion.current) return;
    duck.animate(
      [
        { transform: 'translateY(0) scale(1, 1)' },
        { transform: 'translateY(-18px) scale(0.95, 1.06)', offset: 0.4 },
        { transform: 'translateY(0) scale(1.06, 0.94)', offset: 0.75 },
        { transform: 'translateY(0) scale(1, 1)' },
      ],
      { duration: 480, easing: 'ease-out' },
    );
  }

  /**
   * Back to the header: the stage's duck flies and shrinks onto the spot of
   * the header's, which then shows again. Measured now, since he swam on.
   */
  async function land(): Promise<void> {
    const target = document.querySelector('[data-mascot-lane-duck]');
    if (!duck || !target || prefersReducedMotion.current) return;
    const from = duck.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    line = null;
    await duck.animate(
      [
        { transform: 'translate(0, 0) scale(1)' },
        {
          transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.height / from.height})`,
        },
      ],
      { duration: LANDING_MS, easing: 'ease-in-out', fill: 'forwards' },
    ).finished;
  }

  onMount(() => {
    if (preload) void stageAtlasReady();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      skip?.();
      window.removeEventListener('keydown', onKey);
      if (current) mascot?.leaveStage();
    };
  });

  /** What a screen reader hears of the beat on screen. */
  let spoken = $derived.by(() => {
    if (!current) return '';
    const said = line ? ` ${line}` : '';
    if (current.kind === 'xp') return `+${current.xp} XP.${said}`;
    return revealed ? `Niveau ${current.level} atteint.${said}` : '';
  });
</script>

{#if current}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center px-4"
    transition:fade
  >
    <!-- The whole screen is the way past a beat: it asks nothing. -->
    <button
      type="button"
      aria-label="Continuer"
      class="absolute inset-0 cursor-pointer {current.kind === 'level'
        ? 'bg-black/50'
        : ''}"
      onclick={() => skip?.()}
    ></button>

    <div
      class="pointer-events-none relative flex flex-col items-center gap-4 text-center"
    >
      {#if current.kind === 'level'}
        {#if revealed}
          <div
            in:fade
            class="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-8 py-6 shadow-overlay"
          >
            <LevelBadge
              level={current.level}
              tone={current.tone}
              decorative
              class="size-20"
            />
            <p class="epi-overline text-muted-foreground">Nouveau niveau</p>
            <p class="font-heading text-display-xl text-foreground">
              {current.level}
            </p>
          </div>
        {:else}
          <div
            class="h-3 w-64 overflow-hidden rounded-full border border-border bg-card"
            aria-hidden="true"
          >
            <div
              class="level-fill h-full w-(--progress) rounded-full bg-primary"
              style:--progress="{Math.round(barRatio * 100)}%"
            ></div>
          </div>
        {/if}
      {/if}

      <!-- He watches the bar fill, eyes open, and lights up at the reveal. -->
      <div class="flex flex-col items-center gap-3">
        <div bind:this={duck} class="origin-bottom">
          <EpiDuck
            atlas="stage"
            pose="front"
            {look}
            eyes={current.kind === 'level' && !revealed ? 'open' : 'joy'}
            class="h-44 w-29 sm:h-56 sm:w-37"
          />
        </div>
        {#if line}
          <p
            in:fade
            class="max-w-72 rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm leading-snug font-bold text-primary shadow-overlay"
          >
            {line}
          </p>
        {/if}
      </div>

      {#if current.kind === 'xp'}
        {#key current}
          <XpFloat amount={current.xp} label={XP_LABEL[current.moment]} />
        {/key}
      {/if}
    </div>
  </div>
{/if}

<!-- Present only while he is on stage: the header's lane holds the one live
     region for what he says there, and stays silent meanwhile. -->
{#if current}
  <p class="sr-only" role="status" aria-live="polite">{spoken}</p>
{/if}

<style>
  /* The wait before a level: the bar runs to its end. */
  @media (prefers-reduced-motion: no-preference) {
    .level-fill {
      transition: width 800ms cubic-bezier(0.4, 0, 0.2, 1);
    }
  }
</style>
