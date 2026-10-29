<script lang="ts">
  import { onMount } from 'svelte';

  /**
   * A line that types itself in once, the way a terminal prints it: the
   * charte's "code as a language", spoken to the person (the calendar's
   * greeting).
   *
   * The whole line is in the page from the first byte, for the server render
   * and for a screen reader; only its visible copy is typed. For someone who
   * asked for less motion that whole line is the visible one, from the first
   * byte too: CSS reads the preference, which the server render cannot. It
   * types once: a line that changes afterwards (another year on the calendar)
   * shows whole, because typing it again on every click would be a tic, not a
   * greeting.
   */
  let {
    text,
    delay = 300,
    speed = 60,
  }: { text: string; delay?: number; speed?: number } = $props();

  let typed = $state(0);
  let done = $state(false);

  onMount(() => {
    let timer = setTimeout(function tick() {
      typed += 1;
      if (typed < text.length) timer = setTimeout(tick, speed);
      else done = true;
    }, delay);
    return () => clearTimeout(timer);
  });
</script>

<span class="sr-only motion-reduce:not-sr-only">{text}</span><span
  aria-hidden="true"
  class="motion-reduce:hidden">{done ? text : text.slice(0, typed)}</span
>
