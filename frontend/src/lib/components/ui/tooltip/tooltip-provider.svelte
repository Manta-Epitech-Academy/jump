<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui';

  /**
   * `ignoreNonKeyboardFocus` is on by default here, against bits-ui's own
   * default: a tooltip speaks when somebody deliberately focuses its trigger,
   * never when a machine hands it the focus. Otherwise any programmatic focus
   * pops one open unprompted, and the usual culprit is a dialog opening onto its
   * first tabbable child (a ⓘ, a copy button). Keyboard focus is unaffected.
   */
  /**
   * One provider, in `routes/+layout.svelte`, and nowhere else (`lint:design`
   * refuses another). bits-ui only skips the delay for the next tooltip within
   * the same provider: with 27 of them, each with its own delay between 100 and
   * 300ms, moving from one ⓘ to its neighbour waited all over again. Now the
   * first tooltip waits `delayDuration`, and any other opened within
   * `skipDelayDuration` (bits' 300ms) of it opens at once and without its
   * entrance (`tooltip-content.svelte`), so reading across a row is instant.
   */
  let {
    ignoreNonKeyboardFocus = true,
    delayDuration = 300,
    ...restProps
  }: TooltipPrimitive.ProviderProps = $props();
</script>

<TooltipPrimitive.Provider
  {ignoreNonKeyboardFocus}
  {delayDuration}
  {...restProps}
/>
