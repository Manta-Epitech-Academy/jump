<!--
  One section of the talent's settings: the card the 2027 mockup draws beside
  the settings' menu, its title in capitals above whatever the section holds.
  Every section is one of these, so they read as one page whichever is open.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="rounded-xl border border-border bg-card p-5 shadow-raised">
  <h2
    class="mb-4 text-base font-bold tracking-widest text-muted-foreground uppercase"
  >
    {title}
  </h2>
  {@render children()}
</section>
