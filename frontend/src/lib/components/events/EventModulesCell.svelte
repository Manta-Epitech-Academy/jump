<script lang="ts">
  import EventModuleIcon from './EventModuleIcon.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import {
    EVENT_MODULE_DEFS,
    type EventModuleKey,
  } from '$lib/domain/eventModules';

  // Compact, fixed-height view of an event's enabled modules for the admin list.
  // Icon chips on a single line (never wrapping) keep every row the same height,
  // unlike the old flex-wrap of text badges that grew rows to three lines. Each
  // chip names its module on hover via the shared Tooltip (one Provider per cell).
  let { modules }: { modules: EventModuleKey[] } = $props();
</script>

{#if modules.length}
  <Tooltip.Provider delayDuration={200}>
    <div class="flex items-center gap-1.5">
      {#each modules as key (key)}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <span
                {...props}
                class="flex size-6 items-center justify-center rounded-sm bg-secondary text-secondary-foreground"
              >
                <EventModuleIcon module={key} class="size-3.5" />
              </span>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>
            {EVENT_MODULE_DEFS[key]?.label ?? key}
          </Tooltip.Content>
        </Tooltip.Root>
      {/each}
    </div>
  </Tooltip.Provider>
{:else}
  <span class="text-xs text-muted-foreground">Aucun</span>
{/if}
