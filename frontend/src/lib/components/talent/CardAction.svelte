<script lang="ts">
  import type { Snippet } from 'svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { cn } from '$lib/utils';

  // The one secondary action of a talent card (DESIGN.md, « Actions on a
  // talent screen »): the 2027 mockup's tinted pill with its arrow, whatever
  // the card. The screen's one heavy action is the hero's neon button; every
  // other thing a talent can open from a card says so in this same shape, so
  // it reads as clickable without competing with it (the PO, 13/10: « tous les
  // liens secondaires sont du même style … c'est pas envahissant »).
  //
  // The pill is ~28px tall, under the talent space's 44px touch target, so a
  // link or a button grows an invisible hit area around it (`before:`): the
  // eye gets the mockup's size, the thumb gets the target. Inside a card that
  // is itself the link, the card is the target and nothing is added.
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

  const pill =
    'group/action inline-flex cursor-pointer items-center gap-1.5 self-start rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary transition-ui hover:bg-primary/20 group-hover:bg-primary/20';
  // Only what is its own target: a span inside a linked card is not.
  const hitArea =
    "relative before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']";

  const classes = $derived(cn(pill, className));
  const targetClasses = $derived(cn(pill, hitArea, className));
</script>

{#snippet content()}
  {#if icon}{@render icon()}{/if}
  {@render children()}
  {#if count}
    <span
      class="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground"
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
  <a {href} class={targetClasses}>{@render content()}</a>
{:else if onclick}
  <button type="button" {onclick} class={targetClasses}
    >{@render content()}</button
  >
{:else}
  <span class={classes}>{@render content()}</span>
{/if}
