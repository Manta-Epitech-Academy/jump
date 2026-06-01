<script lang="ts">
  import { onMount } from 'svelte';
  import { triggerConfetti } from '$lib/actions/confetti';
  import XpFloat from '$lib/components/talent/XpFloat.svelte';
  import {
    minigameRewardToast,
    minigameRankRewardToast,
  } from '$lib/components/talent/rewardToast';

  // The daily-finish reward and the rank bonus are both granted server-side at
  // finish. The play page floats the finish reward in the moment; this component
  // catches whatever is still unseen on the next talent page the player lands on
  // (the dashboard or the leaderboard), so the celebration follows them either
  // way. Both share one float, so when both are pending they stagger (rank first,
  // then finish) past the float's hide. Marking-seen is a fire-and-forget POST to
  // a page-agnostic endpoint, so a refresh or a stale tab can't replay the float.
  let {
    baseReward = null,
    rankReward = null,
  }: {
    baseReward?: { xp: number } | null;
    rankReward?: { xp: number } | null;
  } = $props();

  let showXpFloat = $state(false);
  let floatAmount = $state(0);

  function celebrateXp(
    amount: number,
    timers: ReturnType<typeof setTimeout>[],
  ) {
    timers.push(
      setTimeout(() => {
        triggerConfetti();
        floatAmount = amount;
        showXpFloat = true;
      }, 300),
    );
    timers.push(setTimeout(() => (showXpFloat = false), 2500));
  }

  onMount(() => {
    const queue: { xp: number; toast: () => void; kind: 'base' | 'rank' }[] =
      [];
    if (rankReward) {
      const { xp } = rankReward;
      queue.push({
        xp,
        toast: () => minigameRankRewardToast(xp),
        kind: 'rank',
      });
    }
    if (baseReward) {
      const { xp } = baseReward;
      queue.push({ xp, toast: () => minigameRewardToast(xp), kind: 'base' });
    }
    if (queue.length === 0) return;

    // Stamp every shown reward seen up front (idempotent) so a reload can't
    // replay it; the visual plays out regardless.
    void fetch('/api/minigames/rewards-seen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kinds: queue.map((q) => q.kind) }),
    });

    const timers: ReturnType<typeof setTimeout>[] = [];
    const STEP = 2800; // just past the 2500ms float hide, so floats don't stack
    queue.forEach((item, i) => {
      const at = i * STEP;
      timers.push(setTimeout(() => celebrateXp(item.xp, timers), at));
      timers.push(setTimeout(item.toast, at + 1000));
    });
    return () => timers.forEach(clearTimeout);
  });
</script>

{#if showXpFloat}
  <XpFloat amount={floatAmount} />
{/if}
