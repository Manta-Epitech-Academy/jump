<script lang="ts">
  import { onMount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';

  /**
   * A line that types itself in once, the way a terminal prints it: the
   * charte's "code as a language", spoken to the person (the calendar's
   * greeting).
   *
   * The whole line is in the page from the first byte, for the server render
   * and for a screen reader; only its visible copy is typed, and it is whole at
   * once for someone who asked for less motion. It types once: a line that
   * changes afterwards (another year on the calendar) shows whole, because
   * typing it again on every click would be a tic, not a greeting.
   */
  let {
    text,
    delay = 300,
    speed = 60,
  }: { text: string; delay?: number; speed?: number } = $props();

  let typed = $state(0);
  let done = $state(false);

  onMount(() => {
    if (prefersReducedMotion.current) {
      done = true;
      return;
    }
    let timer = setTimeout(function tick() {
      typed += 1;
      if (typed < text.length) timer = setTimeout(tick, speed);
      else done = true;
    }, delay);
    return () => clearTimeout(timer);
  });
</script>

<span class="sr-only">{text}</span><span aria-hidden="true"
  >{done ? text : text.slice(0, typed)}</span
>
