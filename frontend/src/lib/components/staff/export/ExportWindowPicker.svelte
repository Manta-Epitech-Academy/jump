<script lang="ts">
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import {
    EXPORT_PERIOD_OPTIONS,
    type ExportPeriod,
  } from './exportWindow.svelte';

  // The "Période" block of an export menu: the rolling-window segments plus the
  // two date inputs a custom window needs. Identical in all three menus that
  // have one, down to the invalid-range message.
  let {
    exportWindow: w,
  }: {
    exportWindow: {
      period: ExportPeriod;
      customFrom: string;
      customTo: string;
      readonly customInvalid: boolean;
    };
  } = $props();
</script>

<div class="space-y-2">
  <span
    class="font-mono text-[0.7rem] tracking-wider text-muted-foreground uppercase"
  >
    Période
  </span>
  <SegmentedFilter
    options={EXPORT_PERIOD_OPTIONS}
    value={w.period}
    onChange={(v) => (w.period = v as ExportPeriod)}
    ariaLabel="Période d'export"
    fullWidth
  />

  {#if w.period === 'custom'}
    <div class="flex items-end gap-2 pt-1">
      <label
        class="flex flex-1 flex-col gap-1 text-[0.7rem] tracking-wide text-muted-foreground uppercase"
      >
        Du
        <input
          type="date"
          bind:value={w.customFrom}
          max={w.customTo || undefined}
          class="h-9 w-full rounded-sm border bg-transparent px-2 text-sm normal-case"
        />
      </label>
      <label
        class="flex flex-1 flex-col gap-1 text-[0.7rem] tracking-wide text-muted-foreground uppercase"
      >
        Au
        <input
          type="date"
          bind:value={w.customTo}
          min={w.customFrom || undefined}
          class="h-9 w-full rounded-sm border bg-transparent px-2 text-sm normal-case"
        />
      </label>
    </div>
    {#if w.customInvalid}
      <p class="text-xs text-muted-foreground">
        Choisissez une date de début et de fin valides.
      </p>
    {/if}
  {/if}
</div>
