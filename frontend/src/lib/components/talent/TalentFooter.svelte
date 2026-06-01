<!-- The talent-space footer: what Jump is. Shared across the dashboard, the
     daily-training pages, the leaderboard, welcome and onboarding so every
     talent screen carries the same chrome and none feels like it dropped out of
     the app. Background-less by design — it sits flush on every surface. The
     `class` prop lets a host layout add stacking/flex context (e.g. a flex
     column footer needs `shrink-0`) without forking the markup. -->
<script lang="ts">
  import { cn } from '$lib/utils';

  let { class: className = '' }: { class?: string } = $props();
</script>

<footer
  class={cn(
    'px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400',
    className,
  )}
>
  <span class="font-heading tracking-wide text-epi-blue">Jump</span>, la
  plateforme qui t'accompagne lors de tes stages et coding clubs à Epitech.
</footer>
