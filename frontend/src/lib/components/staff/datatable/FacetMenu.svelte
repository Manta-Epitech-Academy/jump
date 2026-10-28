<script lang="ts" module>
  /**
   * Past this many values a facet gets a search box (a campus's lycées); below
   * it the box would only push a handful of rows down. Same split as the
   * staff filter controls in `.claude/rules/ui.md`: short list, pick it; long
   * list, type it.
   */
  export const FACET_SEARCH_THRESHOLD = 8;
</script>

<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import Check from '@lucide/svelte/icons/check';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import type { FacetOption } from './types';
  import { buildHaystack, matchesAllTokens, searchTokens } from './search';

  // The checkbox list of one column filter: every value with how many rows
  // carry it, several ticked at once. Each tick applies immediately, so the
  // table behind it answers as the dev picks; "OK" only closes. Shared by the
  // header popover and the mobile filter drawer, so the two can never offer a
  // different list.
  let {
    title,
    options,
    selected,
    onChange,
    onDone,
  }: {
    /** What is filtered, for the search box and the accessible name. */
    title: string;
    options: FacetOption[];
    selected: readonly string[];
    onChange: (values: string[]) => void;
    /** Shows an "OK" that closes the surface holding the menu. */
    onDone?: () => void;
  } = $props();

  const searchable = $derived(options.length > FACET_SEARCH_THRESHOLD);

  // The staff lists' own matching (accent-insensitive, every token), applied
  // to the label alone: Command's fuzzy default would also match the option's
  // id, and a cuid contains most letters.
  function matchLabel(_value: string, search: string, keywords?: string[]) {
    return matchesAllTokens(buildHaystack(keywords ?? []), searchTokens(search))
      ? 1
      : 0;
  }

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }
</script>

<!-- Command highlights its first row from the start, which reads as "ticked"
     when several menus sit side by side (the mobile drawer). The highlight
     shows only while the menu has focus, where it is the keyboard cursor. -->
<Command.Root
  label={`Filtrer par ${title.toLowerCase()}`}
  filter={matchLabel}
  class="group/facet"
>
  {#if searchable}
    <Command.Input placeholder="Rechercher…" />
  {/if}
  <Command.List class="max-h-[300px] overflow-y-auto">
    <Command.Empty>Aucune valeur.</Command.Empty>
    {#each options as opt (opt.value)}
      {@const on = selected.includes(opt.value)}
      <!-- Command keys its items by `value`, so it is the option's own value
           (two lycées can share a name); the search box matches `keywords`. -->
      <Command.Item
        value={opt.value}
        keywords={[opt.label]}
        onSelect={() => toggle(opt.value)}
        aria-checked={on}
        class="cursor-pointer hover:bg-accent aria-selected:bg-transparent aria-selected:text-foreground group-focus-within/facet:aria-selected:bg-accent group-focus-within/facet:aria-selected:text-accent-foreground"
      >
        <span
          aria-hidden="true"
          class={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-raised dark:bg-input/30',
            on && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {#if on}<Check class="size-3 text-primary-foreground" />{/if}
        </span>
        <span class="min-w-0 flex-1 truncate">{opt.label}</span>
        <span class="text-xs text-muted-foreground tabular-nums">
          {opt.count}
        </span>
      </Command.Item>
    {/each}
  </Command.List>
</Command.Root>
<div class="flex items-center justify-between gap-2 border-t px-2 py-2">
  <Button
    variant="ghost"
    size="sm"
    class="h-7 px-2 text-muted-foreground"
    disabled={selected.length === 0}
    onclick={() => onChange([])}
  >
    Effacer
  </Button>
  {#if onDone}
    <Button size="sm" class="h-7 px-3" onclick={onDone}>OK</Button>
  {/if}
</div>
