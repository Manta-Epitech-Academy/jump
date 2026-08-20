<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Canonical admin page header (Epitech charte): Anton display title with a
   * pink-accented keyword and optional `_` terminal cursor, a bold uppercase
   * subtitle, and an optional right-aligned actions slot. Replaces the
   * hand-rolled `<h1 class="font-heading text-3xl …">` blocks that the admin
   * dashboard / campuses pages each inline.
   */
  type Props = {
    /** Leading words of the title, rendered in the foreground colour. */
    title: string;
    /** The keyword highlighted in the brand pink. */
    accent?: string;
    /** Bold uppercase line under the title. */
    subtitle?: string;
    /** Append the neon `_` terminal cursor after the accent. */
    cursor?: boolean;
    /** Right-aligned controls (buttons, links). */
    actions?: Snippet;
  };

  let { title, accent, subtitle, cursor = false, actions }: Props = $props();
</script>

<div class="flex flex-wrap items-end justify-between gap-4">
  <div class="min-w-0">
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      {title}{#if accent}{' '}<span class="text-epi-tomorrow">{accent}</span
        >{/if}{#if cursor}<span class="text-epi-tech">_</span>{/if}
    </h1>
    {#if subtitle}
      <p class="text-sm font-bold text-muted-foreground uppercase">
        {subtitle}
      </p>
    {/if}
  </div>
  {#if actions}
    <div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
  {/if}
</div>
