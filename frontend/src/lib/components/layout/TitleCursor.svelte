<script lang="ts">
  /**
   * The charte's terminal cursor, the `_` that ends a title: `TALENTS_`.
   *
   * It exists as a component because it was hand-typed at 41 call sites, which
   * meant its colour was decided 41 times (green on most screens, magenta on
   * five admin pages) and its `aria-hidden` never was. It is decoration: a
   * screen reader announcing "talents underscore" is noise.
   *
   * The colour is not a prop and must not become one. The neon green is 1.33:1
   * on white, so the ink variant carries the signature on a light surface and
   * the raw neon on a dark one, and `--epi-tech-ink` already swaps to the neon
   * under `.dark` and under `.on-dark`. Put `on-dark` on an always-dark surface
   * (sidebar, staff top bar, brand-blue hero) and this is right there too.
   *
   * `blink` is the charte's one sanctioned motion for it, a terminal cursor
   * blinking after live text. Use it for that and nothing else.
   *
   * Call sites leave no whitespace between the title text and this element:
   * without a break opportunity the cursor cannot wrap onto a line of its own.
   */
  let { blink = false }: { blink?: boolean } = $props();
</script>

<span
  aria-hidden="true"
  class="text-epi-tech-ink {blink ? 'animate-pulse' : ''}">_</span
>
