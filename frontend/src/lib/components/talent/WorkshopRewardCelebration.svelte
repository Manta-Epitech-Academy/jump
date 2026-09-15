<script lang="ts">
  import { triggerConfetti } from '$lib/actions/confetti';
  import XpFloat from '$lib/components/talent/XpFloat.svelte';
  import { workshopRewardToast } from '$lib/components/talent/rewardToast';

  // An activity is walked in a second tab, and often in the evening at home, so
  // nothing on the Jump side witnesses the moment XP are earned: the callback
  // arrives whenever CTFd's outbox drains. This is the celebration for that, and
  // it fires on the dashboard when the talent comes back to the tab.
  //
  // `reward` is the SUM of everything unacknowledged, so one float covers an
  // evening's worth of steps rather than one per callback. Acknowledging is a
  // fire-and-forget POST sent UP FRONT, before the animation, so leaving
  // mid-animation cannot replay it on the next visit.
  let { reward = null }: { reward?: { xp: number } | null } = $props();

  let shownXp = $state<number | null>(null);

  // AN EFFECT AND NOT `onMount`, and that is the whole difference with the
  // minigame sibling. A player comes back to the minigame reward by NAVIGATING,
  // so the page mounts with it already in `data`. An activity's XP arrive on a
  // page that is already mounted: the talent switches back to this tab, the
  // dashboard revalidates, and the reward appears in `data` afterwards. Mount has
  // long since run by then, so celebrating from it would silently do nothing,
  // which is exactly what it did.
  $effect(() => {
    const xp = reward?.xp ?? null;
    if (xp === null) return;

    void fetch('/api/workshops/rewards-seen', { method: 'POST' });

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        triggerConfetti();
        shownXp = xp;
      }, 300),
    );
    timers.push(setTimeout(() => workshopRewardToast(xp), 1000));
    timers.push(setTimeout(() => (shownXp = null), 2500));
    return () => timers.forEach(clearTimeout);
  });
</script>

{#if shownXp !== null}
  <XpFloat amount={shownXp} label="Activité en cours" />
{/if}
