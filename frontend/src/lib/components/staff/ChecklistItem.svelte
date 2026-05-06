<script lang="ts">
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { cn } from '$lib/utils';

  type BaseProps = {
    title: string;
    meta?: string;
    /** danger = urgent (red bg + ⚠ URGENT prefix); info/warning = neutral checklist row. */
    severity?: 'info' | 'warning' | 'danger';
    /** When true, render the box as ticked. Defaults to false (open item). */
    done?: boolean;
  };

  type Props = BaseProps &
    ({ href: string; onclick?: never } | { href?: never; onclick: () => void });

  let {
    title,
    meta,
    severity = 'info',
    done = false,
    href,
    onclick,
  }: Props = $props();

  const urgent = $derived(severity === 'danger' && !done);

  const containerClass = $derived(
    cn(
      'group grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/30',
      urgent && 'bg-red-500/5 hover:bg-red-500/10',
    ),
  );

  const boxClass = $derived(
    cn(
      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border-[1.5px]',
      done
        ? 'border-epi-teal-solid bg-epi-teal-solid'
        : 'border-muted-foreground/30 bg-card',
    ),
  );

  const titleClass = $derived(
    cn(
      'truncate text-sm font-medium',
      done ? 'text-muted-foreground line-through' : 'text-foreground',
    ),
  );

  const metaClass = $derived(
    cn(
      'mt-0.5 truncate font-mono text-[10px] font-medium tracking-wider',
      urgent ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
    ),
  );
</script>

{#snippet body()}
  <div class={boxClass}>
    {#if done}
      <svg
        class="h-3 w-3 text-white"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="3 8 7 12 13 4"></polyline>
      </svg>
    {/if}
  </div>
  <div class="min-w-0">
    <div class={titleClass}>{title}</div>
    {#if meta}
      <p class={metaClass}>
        {#if urgent}<span class="mr-1.5">⚠ URGENT</span>{/if}{meta}
      </p>
    {/if}
  </div>
  <ArrowRight
    class="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
  />
{/snippet}

{#if onclick}
  <button type="button" {onclick} class={containerClass}>
    {@render body()}
  </button>
{:else if href}
  <a {href} class={containerClass}>
    {@render body()}
  </a>
{/if}
