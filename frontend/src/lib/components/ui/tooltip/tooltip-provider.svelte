<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui';

  /**
   * `ignoreNonKeyboardFocus` is on by default here, against bits-ui's own
   * default: a tooltip speaks when somebody deliberately focuses its trigger,
   * never when a machine hands it the focus. Otherwise any programmatic focus
   * pops one open unprompted, and the usual culprit is a dialog opening onto its
   * first tabbable child (a ⓘ, a copy button). Keyboard focus is unaffected.
   */
  let {
    ignoreNonKeyboardFocus = true,
    ...restProps
  }: TooltipPrimitive.ProviderProps = $props();
</script>

<TooltipPrimitive.Provider {ignoreNonKeyboardFocus} {...restProps} />
