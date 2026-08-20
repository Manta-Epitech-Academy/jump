<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import Clock from '@lucide/svelte/icons/clock';
  import { cn } from '$lib/utils';
  import {
    activityTypeLabels,
    activityTypeStyles,
  } from '$lib/validation/templates';
  import type { TimeSlotWithActivity } from '$lib/types';

  // Read-only preview: the dev planning view mounts it with `slot` + `timezone`
  // to inspect an activity. There is no edit/train footer (planning is authored
  // elsewhere), so the dialog is purely informational.
  let {
    open = $bindable(false),
    slot,
    timezone,
  }: {
    open?: boolean;
    slot: TimeSlotWithActivity | null;
    timezone: string;
  } = $props();

  let activity = $derived(slot?.activity ?? null);
  let styles = $derived(
    activity
      ? activityTypeStyles[
          activity.activityType as keyof typeof activityTypeStyles
        ]
      : null,
  );
  let typeLabel = $derived(
    activity
      ? (activityTypeLabels[
          activity.activityType as keyof typeof activityTypeLabels
        ] ?? activity.activityType)
      : '',
  );

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });
  }

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: timezone,
    });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[85vh] flex-col sm:max-w-2xl">
    {#if activity && slot}
      <Dialog.Header class="shrink-0">
        <div class="flex items-start gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <Dialog.Title class="text-xl leading-tight break-words">
              {activity.nom}
            </Dialog.Title>
            <Dialog.Description
              class="flex flex-wrap items-center gap-1.5 text-xs"
            >
              <span>{formatDate(slot.startTime)}</span>
              <span class="text-muted-foreground/60">·</span>
              <Clock class="h-3 w-3" />
              <span>
                {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
              </span>
            </Dialog.Description>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                class={cn(
                  'rounded border px-1.5 py-0.5 epi-overline',
                  styles?.bg,
                  styles?.accent,
                )}
              >
                {typeLabel}
              </span>
            </div>
          </div>
        </div>
      </Dialog.Header>
    {/if}
  </Dialog.Content>
</Dialog.Root>
