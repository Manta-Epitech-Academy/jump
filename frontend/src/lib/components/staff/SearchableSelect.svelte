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

  // Single-select filter with a built-in search box (Popover + Command). Same
  // surface as the plain Select but typeable, for long option lists (lycées,
  // campuses). `'all'` is the no-filter sentinel, always offered at the top.
  let {
    options,
    value,
    onChange,
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
    /** Current value; `'all'` means no filter. */
    value: string;
    onChange: (value: string) => void;
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
  const selected = $derived(options.find((o) => o.value === value));
  const triggerLabel = $derived(
    value === 'all' ? placeholder : (selected?.label ?? placeholder),
  );

  function select(v: string) {
    onChange(v);
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
        aria-expanded={open}
        class={cn(
          'flex h-9 cursor-pointer items-center justify-between gap-2 rounded-sm border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-colors outline-none select-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
          triggerClass,
        )}
      >
        <span class="flex min-w-0 items-center gap-2">
          <!-- shrink-0: the icon keeps its size; only the label (truncate)
               gives way when the selected option's name is long. Without it
               the icon competes with the label for space and shrinks. -->
          {#if icon}<span class="flex shrink-0">{@render icon()}</span>{/if}
          <span
            class={cn('truncate', value === 'all' && 'text-muted-foreground')}
          >
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
        <Command.Item value={allLabel} onSelect={() => select('all')}>
          <Check
            class={cn('h-4 w-4', value === 'all' ? 'opacity-100' : 'opacity-0')}
          />
          <span class="truncate">{allLabel}</span>
          {#if allCount != null}
            <span
              class="mr-2 ml-auto font-mono text-[10px] font-bold text-muted-foreground"
            >
              {allCount}
            </span>
          {/if}
        </Command.Item>
        {#each options as opt (opt.value)}
          <Command.Item value={opt.label} onSelect={() => select(opt.value)}>
            <Check
              class={cn(
                'h-4 w-4',
                value === opt.value ? 'opacity-100' : 'opacity-0',
              )}
            />
            <span class="truncate">{opt.label}</span>
            {#if opt.count != null}
              <span
                class="mr-2 ml-auto font-mono text-[10px] font-bold text-muted-foreground"
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
