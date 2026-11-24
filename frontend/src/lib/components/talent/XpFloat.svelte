<script lang="ts">
  // The "+N XP" of a celebration: the amount counting up as it pops, rises and
  // fades (`animate-xp-float`, keyframes in routes/layout.css). Placed by the
  // duck's stage (`MascotStage`), which draws it under him in the middle of the
  // screen; `label` is an optional kicker above the amount.
  import { onMount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  let { amount, label }: { amount: number; label?: string } = $props();

  // Count up to the awarded amount with an ease-out so it decelerates into place
  // as the float pops: the rising number is the satisfying beat.
  // Asked for less motion, the amount is simply there: layout.css already
  // swaps the pop and the rise for a fade.
  let display = $state(0);
  onMount(() => {
    if (prefersReducedMotion.current) {
      display = amount;
      return;
    }
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

<div class="animate-xp-float flex flex-col items-center gap-1">
  {#if label}
    <span
      class="text-sm font-bold tracking-[0.2em] text-epi-together/90 uppercase"
    >
      {label}
    </span>
  {/if}
  <div
    class="flex items-center gap-2 text-epi-together drop-shadow-[0_0_25px_rgba(255,95,58,0.55)]"
  >
    <Sparkles class="h-7 w-7" />
    <span class="font-heading text-display-2xl">+{display}</span>
    <span class="text-2xl font-bold">XP</span>
  </div>
</div>
