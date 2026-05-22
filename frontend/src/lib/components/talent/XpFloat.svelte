<script lang="ts">
  // Full-screen "+N XP" reward float — the talent's XP gain celebration.
  // Used for both the onboarding arrival (+50) and the daily minigame (+15);
  // the caller toggles mount and pairs it with confetti. The `animate-xp-float`
  // keyframes live in routes/layout.css.
  let { amount }: { amount: number } = $props();
</script>

<div
  class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
>
  <div
    class="animate-xp-float text-4xl font-bold text-epi-orange drop-shadow-lg"
  >
    +{amount} XP
  </div>
</div>
