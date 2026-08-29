<script lang="ts">
  import * as ResponsiveDialog from '$lib/components/ui/responsive-dialog';
  import Clock from '@lucide/svelte/icons/clock';
  import { cn } from '$lib/utils';
  import {
    activityTypeLabels,
    activityTypeStyles,
  } from '$lib/validation/templates';

  type SlotLike = {
    startTime: Date | string;
    endTime: Date | string;
    nom: string;
    activityType: string;
    // Present on the multi-event calendar so the dialog can name which event the
    // activity belongs to. Optional so single-event callers stay valid.
    event?: { id: string; titre: string };
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

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
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
          <span>{formatDate(slot.startTime)}</span>
          <span class="text-muted-foreground/60">·</span>
          <Clock class="h-3 w-3" />
          <span>
            {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
          </span>
        </ResponsiveDialog.Description>
        {#if slot.event}
          <p class="text-xs font-medium text-muted-foreground">
            {slot.event.titre}
          </p>
        {/if}
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
