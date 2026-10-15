<script lang="ts">
  import { triggerConfetti } from '$lib/actions/confetti';
  import XpFloat from '$lib/components/talent/XpFloat.svelte';
  import { workshopRewardToast } from '$lib/components/talent/rewardToast';
  import type { WorkshopReward } from '$lib/server/services/workshopService';

  // An activity is walked in a second tab, and often in the evening at home, so
  // nothing on the Jump side witnesses the moment XP are earned: the callback
  // arrives whenever CTFd's outbox drains. This is the celebration for that, and
  // it fires on the dashboard when the talent comes back to the tab.
  //
  // `reward.xp` is everything the ledger gained since the last celebration, so
  // one float covers an evening's worth of steps rather than one per callback.
  // Acknowledging is a fire-and-forget POST sent UP FRONT, before the animation,
  // so leaving mid-animation cannot replay it on the next visit. It sends back
  // `reward.upTo`, the amounts that were on screen, so XP landing while the
  // float plays stay owed for the next return instead of being swallowed.
  let { reward = null }: { reward?: WorkshopReward | null } = $props();

  let shownXp = $state<number | null>(null);

  // What this page has already acknowledged, per activity. Every revalidation
  // hands the effect a new `reward` object, and one can land before the
  // acknowledgement has committed: without this, a second `visibilitychange`
  // in that window would play the same float twice. Deliberately not `$state`,
  // since the effect writes it and must not re-run because of it.
  const acknowledged = new Map<string, number>();

  // Owned by the component rather than returned as the effect's cleanup: a
  // revalidation that brings nothing new re-runs the effect, and a cleanup
  // would cut the float it is skipping halfway, toast included.
  let timers: ReturnType<typeof setTimeout>[] = [];
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  $effect(() => clearTimers);

  // AN EFFECT AND NOT `onMount`, and that is the whole difference with the
  // minigame sibling. A player comes back to the minigame reward by NAVIGATING,
  // so the page mounts with it already in `data`. An activity's XP arrive on a
  // page that is already mounted: the talent switches back to this tab, the
  // dashboard revalidates, and the reward appears in `data` afterwards. Mount has
  // long since run by then, so celebrating from it would silently do nothing,
  // which is exactly what it did.
  $effect(() => {
    if (!reward) return;
    const { xp, upTo } = reward;
    const isNew = upTo.some(
      ({ activityId, amount }) => amount > (acknowledged.get(activityId) ?? 0),
    );
    if (!isNew) return;
    for (const { activityId, amount } of upTo) {
      acknowledged.set(activityId, amount);
    }

    void fetch('/api/workshops/rewards-seen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ upTo }),
    });

    clearTimers();
    timers.push(
      setTimeout(() => {
        triggerConfetti();
        shownXp = xp;
      }, 300),
    );
    timers.push(setTimeout(() => workshopRewardToast(xp), 1000));
    timers.push(setTimeout(() => (shownXp = null), 2500));
  });
</script>

{#if shownXp !== null}
  <XpFloat amount={shownXp} label="Activité en cours" />
{/if}
