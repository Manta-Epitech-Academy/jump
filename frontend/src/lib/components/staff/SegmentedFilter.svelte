<script lang="ts" module>
  export type SegmentOption = {
    value: string;
    label: string;
    /** Optional reference count shown after the label (full-population, not the
     *  filtered result — it's a "how many exist" hint, not a live row count). */
    count?: number;
  };
</script>

<script lang="ts">
  import { cn } from '$lib/utils';

  // A one-click radio rendered as a button group. Each option maps to a single
  // value; picking one calls `onChange`. Distinct from `Select` (used for the
  // many-option niveau/campus filters) — this is for short, frequently-toggled
  // dimensions where every choice should be visible at a glance.
  let {
    options,
    value,
    onChange,
    ariaLabel,
  }: {
    options: SegmentOption[];
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
  } = $props();
</script>

<div
  role="radiogroup"
  aria-label={ariaLabel}
  class="inline-flex items-center rounded-sm border bg-muted/40 p-0.5"
>
  {#each options as opt (opt.value)}
    {@const active = value === opt.value}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onclick={() => onChange(opt.value)}
      class={cn(
        'cursor-pointer rounded-[5px] px-3 py-1 text-xs font-bold tracking-wide uppercase transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {opt.label}
      {#if opt.count != null}
        <span
          class={cn(
            'ml-1.5 font-mono',
            active ? 'text-epi-pink' : 'text-muted-foreground/70',
          )}
        >
          {opt.count}
        </span>
      {/if}
    </button>
  {/each}
</div>
