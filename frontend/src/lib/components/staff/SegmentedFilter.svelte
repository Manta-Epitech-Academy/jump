<script lang="ts" module>
  export type SegmentOption = {
    value: string;
    label: string;
    /** Optional reference count shown after the label (full-population, not the
     *  filtered result: it's a "how many exist" hint, not a live row count). */
    count?: number;
  };
</script>

<script lang="ts">
  import { cn } from '$lib/utils';

  // A one-click radio rendered as a button group. Each option maps to a single
  // value; picking one calls `onChange`. Distinct from `Select` (used for the
  // many-option niveau/campus filters): this is for short, frequently-toggled
  // dimensions where every choice should be visible at a glance.
  //
  // FOUR OPTIONS IS THE CEILING. Past that it becomes a `FilterSelect`, which
  // takes the same `SegmentOption[]` so the swap is one component name. The
  // number is not a taste: readable at a glance is the ONLY thing this control
  // buys over a dropdown, and it is what a fifth option spends. Every other
  // segmented filter in the app sat between two and four while the admin talents
  // status filter sat at five, and it was the one that read as a wall: five
  // uppercase French labels came to 51 characters against 26 for the widest of
  // the others, on a toolbar that also carries a search box and three more
  // filters.
  //
  // Width is the second half of the same test, and it can bite below the
  // ceiling: four long labels that push the toolbar onto a second line have
  // already lost the at-a-glance property, so they take the select too. The
  // count is what makes the rule checkable; the wrap is what makes it true.
  //
  // None of this applies to a `fullWidth` group on a row of its own (the export
  // period picker, the broadcast channel switch): it is competing with nothing,
  // so only the reading of the labels themselves bounds it.
  //
  // The look is the 2027 mockup's, through the tokens (`DESIGN.md`, Segmented
  // control): the chosen segment is an inverse fill, the one state on the
  // control nobody has to look twice at, on a flat card ground as tall as a
  // button so it sits level with the toolbar's fields.
  let {
    options,
    value,
    onChange,
    ariaLabel,
    fullWidth = false,
  }: {
    options: SegmentOption[];
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    /** Stretch the group to fill its container, with equal-width segments.
     *  Use when the control sits on its own row rather than inline in a toolbar. */
    fullWidth?: boolean;
  } = $props();
</script>

<div
  role="radiogroup"
  aria-label={ariaLabel}
  class={cn(
    'items-center rounded-sm border bg-card p-0.5',
    fullWidth ? 'flex w-full' : 'inline-flex',
  )}
>
  {#each options as opt (opt.value)}
    {@const active = value === opt.value}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onclick={() => onChange(opt.value)}
      class={cn(
        'h-7.5 cursor-pointer rounded-sm px-4 text-xs font-bold tracking-wider uppercase transition-colors',
        fullWidth && 'flex-1 text-center',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {opt.label}
      {#if opt.count != null}
        <span class="ml-1.5 font-mono opacity-70">
          {opt.count}
        </span>
      {/if}
    </button>
  {/each}
</div>
