<script lang="ts">
  import * as ResponsiveDialog from '$lib/components/ui/responsive-dialog';
  import Clock from '@lucide/svelte/icons/clock';
  import { cn } from '$lib/utils';
  import {
    activityTypeLabels,
    activityTypeStyles,
  } from '$lib/validation/templates';

  type ActivityLike = {
    id: string;
    nom: string;
    description?: string | null;
    activityType: string;
    difficulte?: string | null;
  };

  type SlotLike = {
    startTime: Date | string;
    endTime: Date | string;
    activity: ActivityLike | null;
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
    });
  }

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  const difficultyColors: Record<string, string> = {
    Débutant:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Intermédiaire:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    Avancé:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };
</script>

<ResponsiveDialog.Root bind:open>
  <ResponsiveDialog.Content class="sm:max-w-md">
    {#if activity && slot}
      <ResponsiveDialog.Header>
        <ResponsiveDialog.Title class="text-lg leading-tight break-words">
          {activity.nom}
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
              'rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
              styles?.bg,
              styles?.accent,
            )}
          >
            {typeLabel}
          </span>
          {#if activity.difficulte}
            <span
              class={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold',
                difficultyColors[activity.difficulte] ?? '',
              )}
            >
              {activity.difficulte}
            </span>
          {/if}
        </div>

        {#if activity.description}
          <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {activity.description}
          </p>
        {/if}
      </ResponsiveDialog.Body>
    {/if}
  </ResponsiveDialog.Content>
</ResponsiveDialog.Root>
