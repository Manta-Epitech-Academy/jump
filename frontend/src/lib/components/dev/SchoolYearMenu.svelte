<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

  /**
   * The dev workspace's school-year context, and the only place it changes.
   *
   * Purely presentational: it holds no year state and knows nothing about
   * events or routes. The layout owns the year (it derives it from the event in
   * view) and owns the navigation, so this component cannot drift from either.
   * It is mounted in both headers, desktop and mobile, which is why it names no
   * chrome tokens: both are theme-following surfaces, so one set of classes
   * covers them and there is no `tone` prop to get wrong.
   */
  let {
    years,
    active,
    onselect,
  }: {
    /** Years the workspace can switch to, most recent first. */
    years: string[];
    /** The year in view: the trigger's readout, and the checked entry. */
    active: string;
    onselect: (year: string) => void;
  } = $props();

  // A control that cannot go anywhere should not look like one. Stated as "is
  // there a year other than this one" rather than `years.length > 1`, so the
  // rare case where the year in view is not itself listed (its only event
  // exposes no surface) still gets a menu rather than a dead readout.
  const canSwitch = $derived(years.some((y) => y !== active));

  // `shrink-0` + `nowrap`: the mobile bar is a flex row, and without them the
  // year breaks at its hyphen ("2025-" / "2026"), grows the bar and squeezes
  // whatever sits beside it.
  const base =
    'flex h-9 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-bold whitespace-nowrap';
</script>

{#if canSwitch}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      aria-label="Changer d'année scolaire"
      class="{base} cursor-pointer border border-border bg-background text-foreground hover:bg-muted/50"
    >
      <CalendarDays class="h-4 w-4 text-muted-foreground" />
      <span>{active}</span>
      <ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-48 rounded-sm">
      <DropdownMenu.Label>Année scolaire</DropdownMenu.Label>
      <DropdownMenu.Separator />
      <DropdownMenu.RadioGroup value={active} onValueChange={onselect}>
        {#each years as year (year)}
          <DropdownMenu.RadioItem value={year} class="cursor-pointer text-xs">
            {year}
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <span class="{base} text-foreground select-none">
    <CalendarDays class="h-4 w-4 text-muted-foreground" />
    {active}
  </span>
{/if}
