<script lang="ts">
  import { navigating } from '$app/state';
  import { untrack } from 'svelte';

  // Slim top progress bar shown during client-side navigations. SvelteKit blocks
  // a nav on the destination's `load`, so the current page stays on screen until
  // it resolves; without feedback the click feels dead. This gives the click an
  // immediate, indeterminate response: trickle to ~90% while the load runs, snap
  // to 100% and fade out when it lands. Full document loads (no `navigating.to`)
  // keep the browser's own progress, so the bar stays out of their way.
  let visible = $state(false);
  let width = $state(0);
  let finishing = $state(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  let rampFrame = 0;

  $effect(() => {
    // The only tracked dependency: are we mid client navigation?
    const inFlight = navigating.to != null;
    untrack(() => {
      if (inFlight) {
        clearTimeout(resetTimer);
        cancelAnimationFrame(rampFrame);
        finishing = false;
        visible = true;
        width = 0;
        // Two frames so the width:0 start paints before we ramp, otherwise the
        // transition has nothing to animate from and the bar jumps to 90%.
        rampFrame = requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            width = 90;
          }),
        );
      } else if (visible) {
        cancelAnimationFrame(rampFrame);
        finishing = true;
        width = 100;
        resetTimer = setTimeout(() => {
          visible = false;
          width = 0;
          finishing = false;
        }, 250);
      }
    });
  });
</script>

{#if visible}
  <div
    class="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden"
    aria-hidden="true"
  >
    <div
      class="h-full bg-primary transition-[width] ease-out {finishing
        ? 'duration-200'
        : 'duration-[600ms]'}"
      style="width: {width}%"
    ></div>
  </div>
{/if}
