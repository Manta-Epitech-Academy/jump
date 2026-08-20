<script lang="ts" module>
  import type { EventConfigState } from '$lib/domain/eventReadiness';

  // The État badge colour. Past events mute to grey: their config state is
  // historical, not a to-do, so it shouldn't alarm in amber.
  export function stateBadgeClass(
    state: EventConfigState,
    isPast: boolean,
  ): string {
    if (isPast) return 'border-border text-muted-foreground';
    switch (state) {
      case 'shown':
        return 'border-emerald-500/40 text-emerald-600';
      case 'ready':
        return 'border-blue-500/40 text-blue-600';
      case 'unconfigured':
        return 'border-amber-500/50 text-amber-600';
    }
  }
</script>

<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import {
    EVENT_CONFIG_STATE_LABELS,
    EVENT_CONFIG_STATE_HINTS,
  } from '$lib/domain/eventReadiness';

  // The readiness badge shared by the events cockpit (per-row "État") and the
  // admin dashboard's recent-events feed. An outline pill whose label + tooltip
  // come from the config state, muted to grey once the event is past.
  let { state, past = false }: { state: EventConfigState; past?: boolean } =
    $props();
</script>

<Tooltip.Provider delayDuration={200}>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Badge
          {...props}
          variant="outline"
          class="shrink-0 text-xs font-normal {stateBadgeClass(state, past)}"
        >
          {EVENT_CONFIG_STATE_LABELS[state]}
        </Badge>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="max-w-56 text-xs">
      {EVENT_CONFIG_STATE_HINTS[state]}
    </Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
