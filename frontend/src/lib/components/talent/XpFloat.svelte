<script lang="ts">
  // Full-screen "+N XP" reward float — the talent's XP gain celebration.
  // Used for both the onboarding arrival (+200) and the daily minigame (+50);
  // the caller toggles mount and pairs it with confetti. The number counts up
  // for extra game-juice; the `animate-xp-float` rise/fade keyframes live in
  // routes/layout.css. `label` is an optional kicker rendered above the amount.
  import { onMount } from 'svelte';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  let { amount, label }: { amount: number; label?: string } = $props();

  // Count up to the awarded amount with an ease-out so it decelerates into place
  // as the float pops — the rising number is the satisfying beat.
  let display = $state(0);
  onMount(() => {
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      display = Math.round((1 - Math.pow(1 - t, 3)) * amount);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div
  class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
>
  <div class="animate-xp-float flex flex-col items-center gap-1">
    {#if label}
      <span
        class="text-sm font-bold tracking-[0.2em] text-epi-orange/90 uppercase"
      >
        {label}
      </span>
    {/if}
    <div
      class="flex items-center gap-2 text-epi-orange drop-shadow-[0_0_25px_rgba(255,95,58,0.55)]"
    >
      <Sparkles class="h-7 w-7" />
      <span class="font-heading text-6xl tabular-nums">+{display}</span>
      <span class="text-2xl font-bold">XP</span>
    </div>
  </div>
</div>
