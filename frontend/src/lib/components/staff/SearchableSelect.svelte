<script lang="ts" module>
  export type SelectOption = {
    value: string;
    label: string;
    /** Optional trailing tally shown right-aligned in the dropdown row. */
    count?: number;
  };
</script>

<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { cn } from '$lib/utils';

  // Searchable filter with a built-in search box (Popover + Command). Same
  // surface as the plain Select but typeable, for long option lists (lycées,
  // campuses). `'all'` is the no-filter sentinel, always offered at the top.
  //
  // Single-select (default): drive with `value` + `onChange`, picking closes
  // the popover. Multi-select (`multiple`): drive with `values` +
  // `onChangeMultiple`; picking toggles and keeps the popover open so several
  // can be chosen in one go, and the `'all'` row clears the whole selection.
  let {
    options,
    value = 'all',
    onChange,
    multiple = false,
    values = [],
    onChangeMultiple,
    clearable = true,
    disabled = false,
    allLabel = 'Tous',
    allCount,
    placeholder = 'Filtrer…',
    searchPlaceholder = 'Rechercher…',
    emptyLabel = 'Aucun résultat.',
    triggerClass,
    contentClass = 'w-[--bits-popover-anchor-width]',
    icon,
  }: {
    options: SelectOption[];
    /** Current value (single mode); `'all'` means no filter. */
    value?: string;
    onChange?: (value: string) => void;
    /** Opt into multi-select; pair with `values` + `onChangeMultiple`. */
    multiple?: boolean;
    /** Selected values (multi mode); empty means no filter. */
    values?: string[];
    onChangeMultiple?: (values: string[]) => void;
    /**
     * Single mode only: render the `'all'` sentinel row. Default `true` (this is
     * a filter). Pass `false` to use it as a required form field: the sentinel
     * row is dropped, and the trigger shows `placeholder` until a real option is
     * picked (a `value` not in `options` reads as unselected). Multi mode always
     * keeps the row as its clear-all.
     */
    clearable?: boolean;
    /** Disable the trigger (e.g. a dependent field gated on another). */
    disabled?: boolean;
    allLabel?: string;
    /** Optional tally shown on the `'all'` row (e.g. the cohort total). */
    allCount?: number;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyLabel?: string;
    triggerClass?: string;
    /**
     * Popover width. Defaults to matching the trigger; pass a fixed/larger
     * width when option labels are long (the trigger can stay compact while
     * the dropdown breathes).
     */
    contentClass?: string;
    icon?: import('svelte').Snippet;
  } = $props();

  let open = $state(false);
  // `none` = nothing selected (trigger is muted, showing the placeholder). With
  // a sentinel the `'all'` value means none; without one (required field) it's
  // any `value` that doesn't match a real option.
  const none = $derived(
    multiple
      ? values.length === 0
      : clearable
        ? value === 'all'
        : !options.some((o) => o.value === value),
  );
  const isSelected = $derived((v: string) =>
    multiple ? values.includes(v) : value === v,
  );
  const triggerLabel = $derived.by(() => {
    if (none) return placeholder;
    if (multiple) {
      if (values.length === 1) {
        return options.find((o) => o.value === values[0])?.label ?? placeholder;
      }
      return `${values.length} ${allLabel.toLowerCase().replace(/^tous?\s+(les\s+)?/, '')}`;
    }
    return options.find((o) => o.value === value)?.label ?? placeholder;
  });

  function select(v: string) {
    if (multiple) {
      // `'all'` clears; otherwise toggle the value in/out. Keep the popover
      // open so the admin can pick several campuses without reopening.
      if (v === 'all') onChangeMultiple?.([]);
      else {
        const set = new Set(values);
        if (set.has(v)) set.delete(v);
        else set.add(v);
        onChangeMultiple?.([...set]);
      }
      return;
    }
    onChange?.(v);
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <!-- Mirrors the shadcn Select trigger so it sits coherently next to the
           plain Select/SegmentedFilter controls (normal case, not the bold
           uppercase of a Button). -->
      <button
        {...props}
        type="button"
        role="combobox"
        {disabled}
        aria-expanded={open}
        class={cn(
          'flex h-9 cursor-pointer items-center justify-between gap-2 rounded-sm border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-raised transition-colors select-none hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
          triggerClass,
        )}
      >
        <span class="flex min-w-0 items-center gap-2">
          <!-- shrink-0: the icon keeps its size; only the label (truncate)
               gives way when the selected option's name is long. Without it
               the icon competes with the label for space and shrinks. -->
          {#if icon}<span class="flex shrink-0">{@render icon()}</span>{/if}
          <span class={cn('truncate', none && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
        </span>
        <ChevronDown class="size-4 shrink-0 opacity-50" />
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class={cn('p-0', contentClass)} align="start">
    <Command.Root>
      <Command.Input placeholder={searchPlaceholder} />
      <Command.List class="max-h-[300px] overflow-y-auto">
        <Command.Empty>{emptyLabel}</Command.Empty>
        {#if clearable || multiple}
          <Command.Item value={allLabel} onSelect={() => select('all')}>
            <Check class={cn('h-4 w-4', none ? 'opacity-100' : 'opacity-0')} />
            <span class="truncate">{allLabel}</span>
            {#if allCount != null}
              <span
                class="mr-2 ml-auto font-mono text-xs font-bold text-muted-foreground"
              >
                {allCount}
              </span>
            {/if}
          </Command.Item>
        {/if}
        {#each options as opt (opt.value)}
          <Command.Item value={opt.label} onSelect={() => select(opt.value)}>
            <Check
              class={cn(
                'h-4 w-4',
                isSelected(opt.value) ? 'opacity-100' : 'opacity-0',
              )}
            />
            <span class="truncate">{opt.label}</span>
            {#if opt.count != null}
              <span
                class="mr-2 ml-auto font-mono text-xs font-bold text-muted-foreground"
              >
                {opt.count}
              </span>
            {/if}
          </Command.Item>
        {/each}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
