<script lang="ts">
  import * as Select from '$lib/components/ui/select';
  import { cn } from '$lib/utils';
  import type { SegmentOption } from './SegmentedFilter.svelte';

  // The dropdown counterpart to SegmentedFilter: same `SegmentOption[]` shape and
  // single-value contract, but collapsed behind a Select trigger instead of an
  // always-visible button row. Reach for it over SegmentedFilter when the choices
  // are too many (or too wide) to sit inline in a toolbar without crowding it, yet
  // still a short, known list — so SearchableSelect's search box would be overkill.
  // (SearchableSelect stays for long, typeable lists like lycées or campuses.)
  // By convention the first option is the no-filter sentinel (`all`).
  let {
    options,
    value,
    onChange,
    ariaLabel,
    triggerClass,
  }: {
    options: SegmentOption[];
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    /** Override the trigger width (defaults to a compact w-44). */
    triggerClass?: string;
  } = $props();

  // The trigger shows the active option's own label; fall back to the first
  // option so the trigger is never blank if `value` drifts out of the list.
  const selectedLabel = $derived(
    options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '',
  );
</script>

<Select.Root type="single" {value} onValueChange={onChange}>
  <!-- `default` size = h-9, so the trigger lines up with the search Input it sits
       beside in a DataTableToolbar (sm/h-8 left it visibly short). -->
  <Select.Trigger
    size="default"
    class={cn('w-44 cursor-pointer rounded-sm', triggerClass)}
    aria-label={ariaLabel}
  >
    <span class="truncate">{selectedLabel}</span>
  </Select.Trigger>
  <Select.Content>
    {#each options as opt (opt.value)}
      <Select.Item value={opt.value}>
        {opt.label}
        {#if opt.count != null}
          <span class="ml-1.5 font-mono text-muted-foreground/70">
            {opt.count}
          </span>
        {/if}
      </Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
