<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  /**
   * The charte's code tag: `< accroche />`.
   *
   * Wraps a tagline, an accroche, a date range. Never a control label: the
   * delimiters are decoration, and a button says what it does without them.
   *
   * The delimiters are generated and `aria-hidden`, so a screen reader reads the
   * accroche and not "less than accroche slash greater than". That is the whole
   * reason this is a component: it was hand-typed as `&lt;` / `&gt;` at fifteen
   * call sites, none of which hid them, and three of which also hand-rolled a
   * different opacity for them.
   */
  let { children, class: className }: { children: Snippet; class?: string } =
    $props();
</script>

<span class={cn('font-mono', className)}>
  <span aria-hidden="true" class="opacity-60">&lt;</span>
  {@render children()}
  <span aria-hidden="true" class="opacity-60">/&gt;</span>
</span>
