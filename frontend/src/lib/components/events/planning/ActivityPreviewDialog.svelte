<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { renderMarkdown } from '$lib/markdown';
  import {
    Pencil,
    Trash2,
    ExternalLink,
    Zap,
    FlaskConical,
    Clock,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { cn } from '$lib/utils';
  import {
    activityTypeLabels,
    activityTypeStyles,
  } from '$lib/validation/templates';
  import type { TimeSlotWithActivity } from '$lib/types';
  import type { ActivityStructure } from '$lib/server/services/progressService';

  let {
    open = $bindable(false),
    slot,
    timezone,
    canEdit,
    canTrain,
    eventId,
    onEdit,
    onDelete,
  }: {
    open: boolean;
    slot: TimeSlotWithActivity | null;
    timezone: string;
    canEdit: boolean;
    canTrain: boolean;
    eventId: string | null;
    onEdit: () => void;
    onDelete: () => void;
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

  let structure = $derived(
    activity?.isDynamic
      ? ((activity.contentStructure as ActivityStructure | null) ?? null)
      : null,
  );
  let stepCount = $derived(structure?.steps?.length ?? 0);

  let staticHtml = $derived(
    activity && !activity.isDynamic && activity.content
      ? renderMarkdown(activity.content)
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
              {#if activity.isDynamic}
                <Badge
                  variant="outline"
                  class="gap-1 border-epi-orange text-[10px] text-epi-orange"
                >
                  <Zap class="h-3 w-3" /> Dynamique
                </Badge>
              {/if}
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
        {#if activity.isDynamic}
          <div
            class="flex items-center gap-3 rounded-xl border border-epi-orange/30 bg-epi-orange/5 p-4"
          >
            <Zap class="h-5 w-5 shrink-0 text-epi-orange" />
            <div class="flex flex-col">
              <span class="text-sm font-bold text-epi-orange">
                Activité dynamique
              </span>
              <span class="text-xs text-muted-foreground">
                {#if stepCount > 0}
                  Contenu progressif en {stepCount} étape{stepCount > 1
                    ? 's'
                    : ''}.
                {:else}
                  Aucune étape configurée.
                {/if}
              </span>
            </div>
          </div>
          {#if activity.description}
            <p class="mt-4 text-sm text-muted-foreground">
              {activity.description}
            </p>
          {/if}
        {:else if staticHtml}
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

      <Dialog.Footer class="shrink-0 sm:justify-between">
        <div class="flex items-center gap-1">
          {#if canEdit}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => {
                open = false;
                onEdit();
              }}
            >
              <Pencil class="mr-1.5 h-3.5 w-3.5" /> Modifier
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onclick={() => {
                open = false;
                onDelete();
              }}
            >
              <Trash2 class="mr-1.5 h-3.5 w-3.5" /> Supprimer
            </Button>
          {/if}
        </div>
        {#if canTrain && activity.isDynamic && stepCount > 0 && eventId}
          <Button
            href={resolve(
              `/staff/pedago/events/${eventId}/activities/${activity.id}/practice`,
            )}
            class="rounded-xl bg-epi-orange font-bold text-white hover:bg-epi-orange/90"
          >
            <FlaskConical class="mr-2 h-4 w-4" />
            S'entraîner sur l'activité
          </Button>
        {/if}
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
