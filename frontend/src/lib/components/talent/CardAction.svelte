<script lang="ts">
  import type { Snippet } from 'svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { cn } from '$lib/utils';

  // The one secondary action of a talent card (DESIGN.md, « Actions on a
  // talent screen »): a light link with its arrow, whatever the card. The
  // screen's one heavy action is the hero's neon button; every other thing a
  // talent can open from a card says so in this same voice, so it reads as
  // clickable without competing with it (the PO, 13/10: « tous les liens
  // secondaires sont du même style … c'est pas envahissant »).
  //
  // Three elements, one look:
  //   - inside a card that is itself the link (`XpCard`, `DailyTrainingTile`),
  //     no `href` and no `onclick`: a `span`, the card's own hover moves the
  //     arrow (`group`);
  //   - `href`: its own link;
  //   - `onclick`: a button (« Lire la suite » opens a dialog).
  // A count rides along as a small badge, never as another button shape.
  let {
    href,
    onclick,
    count,
    countLabel,
    icon,
    class: className,
    children,
  }: {
    href?: string;
    onclick?: () => void;
    /** A number to show beside the label, e.g. activities left to do. */
    count?: number;
    /** What the count means, read by a screen reader after the label. */
    countLabel?: string;
    /** Replaces the arrow, for an action that is not « go there » (a trophy). */
    icon?: Snippet;
    class?: string;
    children: Snippet;
  } = $props();

  const classes = $derived(
    cn(
      'group/action inline-flex cursor-pointer items-center gap-1.5 self-start text-sm font-semibold text-primary underline-offset-4 hover:underline',
      className,
    ),
  );
</script>

{#snippet content()}
  {#if icon}{@render icon()}{/if}
  {@render children()}
  {#if count}
    <span
      class="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground no-underline"
      aria-hidden="true">{count}</span
    >
    {#if countLabel}<span class="sr-only">, {countLabel}</span>{/if}
  {/if}
  {#if !icon}
    <ArrowRight
      class="size-4 transition-transform group-hover:translate-x-0.5 group-hover/action:translate-x-0.5"
      aria-hidden="true"
    />
  {/if}
{/snippet}

{#if href}
  <a {href} class={classes}>{@render content()}</a>
{:else if onclick}
  <button type="button" {onclick} class={classes}>{@render content()}</button>
{:else}
  <span class={classes}>{@render content()}</span>
{/if}
