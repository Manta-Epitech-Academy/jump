<script lang="ts">
  import * as ResponsiveDialog from '#lib/components/ui/responsive-dialog/index.ts';
  import Clock from '@lucide/svelte/icons/clock';
  import { cn } from '#lib/utils.ts';
  import {
    activityTypeLabels,
    activityTypeStyles,
  } from '#lib/validation/templates.ts';

  type SlotLike = {
    startTime: Date | string;
    endTime: Date | string;
    nom: string;
    activityType: string;
    // The event the activity belongs to: its name for the line under the title,
    // its campus's timezone for the day and hours, the ones the campus announced.
    event: { id: string; name: string; timezone: string };
  };

  let {
    open = $bindable(false),
    slot,
  }: {
    open: boolean;
    slot: SlotLike | null;
  } = $props();

  let styles = $derived(
    slot
      ? activityTypeStyles[slot.activityType as keyof typeof activityTypeStyles]
      : null,
  );
  let typeLabel = $derived(
    slot
      ? (activityTypeLabels[
          slot.activityType as keyof typeof activityTypeLabels
        ] ?? slot.activityType)
      : '',
  );

  function formatTime(date: Date | string, timeZone: string): string {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
  }

  function formatDate(date: Date | string, timeZone: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone,
    });
  }
</script>

<ResponsiveDialog.Root bind:open>
  <ResponsiveDialog.Content class="sm:max-w-md">
    {#if slot}
      <ResponsiveDialog.Header>
        <ResponsiveDialog.Title class="text-lg leading-tight break-words">
          {slot.nom}
        </ResponsiveDialog.Title>
        <ResponsiveDialog.Description
          class="flex flex-wrap items-center gap-1.5 text-xs"
        >
          <span>{formatDate(slot.startTime, slot.event.timezone)}</span>
          <span class="text-muted-foreground/60">·</span>
          <Clock class="h-3 w-3" />
          <span>
            {formatTime(slot.startTime, slot.event.timezone)} - {formatTime(
              slot.endTime,
              slot.event.timezone,
            )}
          </span>
        </ResponsiveDialog.Description>
        <p class="text-xs font-medium text-muted-foreground">
          {slot.event.name}
        </p>
      </ResponsiveDialog.Header>

      <ResponsiveDialog.Body class="space-y-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class={cn(
              'rounded border px-1.5 py-0.5 epi-chip',
              styles?.bg,
              styles?.accent,
            )}
          >
            {typeLabel}
          </span>
        </div>
      </ResponsiveDialog.Body>
    {/if}
  </ResponsiveDialog.Content>
</ResponsiveDialog.Root>
