<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';
  import CodeTag from './CodeTag.svelte';
  import TitleCursor from './TitleCursor.svelte';
  import TypedText from './TypedText.svelte';

  /**
   * The page header for every staff page: Anton display title ending in the `_`
   * cursor, an optional accent word, a bold uppercase subtitle, and the page's
   * controls on the right.
   *
   * One component for both staff spaces. There used to be two (this one and
   * `admin/PageHeader`) doing the same job differently, which is why the
   * same title was two-tone on one admin screen and fully coloured on the next,
   * and why fourteen of the twenty-seven admin pages hand-rolled an `<h1>`
   * instead of using either.
   *
   * The accent colour is not a prop: it comes from `--accent-space`, which the
   * space sets (blue by default, magenta under `.admin-space`). A caller passes
   * words, never a colour, so a page cannot pick the wrong space's identity.
   *
   * There is deliberately no `font-bold` on the title. Anton has a single
   * weight, so asking for 700 makes the browser fake it by smearing the glyphs,
   * which is what the old dev-space header did on every page.
   */
  type Props = {
    /** Leading words, in the foreground colour. Omit for an accent-only title. */
    title?: string;
    /** Trailing word carried in the space's accent colour. */
    accent?: string;
    /** Bold uppercase line under the title. */
    subtitle?: string;
    /**
     * The charte's mono accroche, rendered inside `< />`. An alternative to
     * `subtitle`, not a companion to it: a header gets one sub-line, and two
     * push the controls that matter further down.
     */
    accroche?: string;
    /**
     * The sub-line as markup, for a page whose context is more than words: an
     * event's home names its category, its days and its countdown. The third
     * form of the one sub-line, never a fourth line.
     */
    meta?: Snippet;
    /** Page controls, right-aligned. */
    actions?: Snippet;
    /**
     * Types the title in once on arrival, the cursor blinking after it, as
     * after a line a terminal just printed. For a title that is a line said to
     * the person (the calendar's greeting), never for a page's name.
     */
    typeTitle?: boolean;
    /** Opt into a view transition on the title. */
    titleViewTransitionName?: string;
    class?: string;
  };

  let {
    title,
    accent,
    subtitle,
    accroche,
    meta,
    actions,
    typeTitle = false,
    titleViewTransitionName,
    class: className,
  }: Props = $props();
</script>

<div
  class={cn(
    'flex flex-col gap-4 border-b pb-4 md:flex-row md:items-end md:justify-between md:border-b-0 md:pb-0',
    className,
  )}
>
  <div class="min-w-0">
    <h1
      class="font-heading text-display-l"
      style:view-transition-name={titleViewTransitionName}
    >
      {#if title}{#if typeTitle}<TypedText
            text={title}
          />{:else}{title}{/if}{/if}{#if accent}{#if title}{' '}{/if}<span
          class="text-accent-space">{accent}</span
        >{/if}<TitleCursor blink={typeTitle} />
    </h1>
    {#if subtitle}
      <p
        class="text-sm font-bold tracking-wider text-muted-foreground uppercase"
      >
        {subtitle}
      </p>
    {:else if accroche}
      <p class="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
        <CodeTag>{accroche}</CodeTag>
      </p>
    {:else if meta}
      <div class="mt-2">{@render meta()}</div>
    {/if}
  </div>
  {#if actions}
    <!-- flex-wrap so a multi-action header (Émargement's export + QR) drops to a
         second line on a phone instead of overflowing; no effect once it fits. -->
    <div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</div>
