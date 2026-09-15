<script lang="ts">
  import { onMount } from 'svelte';
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

  let showXpFloat = $state(false);

  onMount(() => {
    if (!reward) return;
    const { xp } = reward;

    void fetch('/api/workshops/rewards-seen', { method: 'POST' });

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        triggerConfetti();
        showXpFloat = true;
      }, 300),
    );
    timers.push(setTimeout(() => workshopRewardToast(xp), 1000));
    timers.push(setTimeout(() => (showXpFloat = false), 2500));
    return () => timers.forEach(clearTimeout);
  });
</script>

{#if showXpFloat && reward}
  <XpFloat amount={reward.xp} label="Activité en cours" />
{/if}
