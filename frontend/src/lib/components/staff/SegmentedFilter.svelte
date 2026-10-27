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
  //
  // The fill is one block that slides to the segment picked, rather than a fill
  // per segment that blinks across. Its place is measured off the segment it
  // sits under, since labels differ in width, so the server and the first paint
  // fill the chosen segment itself and the block takes over once measured.
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

  let group = $state<HTMLElement>();
  const segments: HTMLButtonElement[] = $state([]);
  /** Where the fill sits, in the group's own coordinates; null until measured. */
  let fill = $state<{ x: number; width: number } | null>(null);
  /** Off for the first placement, so the fill appears in place, not from 0. */
  let sliding = $state(false);

  function placeFill() {
    const segment = segments[options.findIndex((o) => o.value === value)];
    fill = segment
      ? { x: segment.offsetLeft, width: segment.offsetWidth }
      : null;
  }

  $effect(() => {
    void [value, options];
    placeFill();
  });
  $effect(() => {
    if (!group) return;
    // Labels reflow when the font arrives, and a full-width group with its
    // container: the fill follows the segment, not its first measure.
    const observer = new ResizeObserver(placeFill);
    observer.observe(group);
    const frame = requestAnimationFrame(() => (sliding = true));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });
</script>

<div
  bind:this={group}
  role="radiogroup"
  aria-label={ariaLabel}
  class={cn(
    'relative items-center rounded-sm border bg-card p-0.5',
    fullWidth ? 'flex w-full' : 'inline-flex',
  )}
>
  {#if fill}
    <span
      aria-hidden="true"
      class={cn(
        'absolute top-0.5 left-0 h-7.5 w-(--fill-width) translate-x-(--fill-x) rounded-sm bg-foreground',
        sliding &&
          'transition-[translate,width] duration-(--dur-base) ease-standard motion-reduce:transition-none',
      )}
      style:--fill-x="{fill.x}px"
      style:--fill-width="{fill.width}px"
    ></span>
  {/if}
  {#each options as opt, i (opt.value)}
    {@const active = value === opt.value}
    <button
      bind:this={segments[i]}
      type="button"
      role="radio"
      aria-checked={active}
      onclick={() => onChange(opt.value)}
      class={cn(
        'relative h-7.5 cursor-pointer rounded-sm px-4 text-xs font-bold tracking-wider uppercase transition-colors',
        fullWidth && 'flex-1 text-center',
        active
          ? cn('text-background', !fill && 'bg-foreground')
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
