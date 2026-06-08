<script lang="ts" module>
  /**
   * Accent maps to the four DS keywords. `neutral` falls back to the muted
   * foreground — use it when the section doesn't carry a brand-vector
   * meaning (e.g. plain data tables).
   */
  export type SectionAccent =
    | 'blue'
    | 'tech'
    | 'together'
    | 'tomorrow'
    | 'neutral';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  /**
   * Section panel matching the Epitech charte: mono `< />`-wrapped overline,
   * Anton display title with the neon-teal `_` terminal cursor, optional
   * right-aligned meta snippet.
   */
  type Props = {
    /** Optional mono overline above the title. Omit for a title-only header. */
    overline?: string;
    title: string;
    accent?: SectionAccent;
    /** Right-aligned snippet rendered next to the title (e.g. "12/24"). */
    meta?: Snippet;
    children: Snippet;
    class?: string;
  };

  let {
    overline,
    title,
    accent = 'neutral',
    meta,
    children,
    class: extraClass,
  }: Props = $props();

  const accentColor = $derived(
    accent === 'blue'
      ? 'text-epi-blue'
      : accent === 'tech'
        ? 'text-epi-teal-solid'
        : accent === 'together'
          ? 'text-epi-orange'
          : accent === 'tomorrow'
            ? 'text-epi-pink'
            : 'text-muted-foreground',
  );
</script>

<section class={cn('rounded-sm border bg-card dark:shadow-none', extraClass)}>
  <header class="flex items-end justify-between gap-3 border-b px-5 pt-5 pb-4">
    <div class="min-w-0">
      {#if overline}
        <p
          class={cn(
            'font-mono text-[10px] font-bold tracking-widest uppercase',
            accentColor,
          )}
        >
          {overline}
        </p>
      {/if}
      <h2
        class={cn(
          'font-heading text-xl tracking-wide uppercase md:text-2xl',
          overline && 'mt-1.5',
        )}
      >
        {title}<span class="text-epi-teal">_</span>
      </h2>
    </div>
    {#if meta}
      <div class="shrink-0">{@render meta()}</div>
    {/if}
  </header>

  <div class="px-5 pt-4 pb-5">
    {@render children()}
  </div>
</section>
