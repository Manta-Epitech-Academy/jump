<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { sanitizeActivityContent } from '$lib/sanitize';
  import ExternalLink from '@lucide/svelte/icons/external-link';
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

  let staticHtml = $derived(
    activity && activity.content
      ? sanitizeActivityContent(activity.content)
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

  const difficultyColors: Record<string, string> = {
    Débutant:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Intermédiaire:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    Avancé:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };
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
              {#if activity.link}
                <a
                  href={activity.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-epi-blue"
                >
                  <ExternalLink class="h-3 w-3" />
                  Support externe
                </a>
              {/if}
            </div>
          </div>
        </div>
      </Dialog.Header>

      <div class="min-h-0 flex-1 overflow-y-auto pt-2">
        {#if staticHtml}
          <div
            class="prose max-w-none text-sm leading-relaxed prose-slate dark:prose-invert"
          >
            {@html staticHtml}
          </div>
        {:else}
          <p class="text-sm text-muted-foreground italic">
            Aucun contenu texte renseigné pour cette activité.
          </p>
        {/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
