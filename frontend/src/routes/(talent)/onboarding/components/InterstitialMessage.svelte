<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';

  let { message, ondone }: { message: string; ondone: () => void } = $props();

  onMount(() => {
    const timer = setTimeout(ondone, 800);
    return () => clearTimeout(timer);
  });
</script>

<div
  class="flex items-center justify-center"
  in:fade={{ duration: 200 }}
  out:fade={{ duration: 200 }}
>
  <p
    class="font-heading text-3xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    {message}
  </p>
</div>
