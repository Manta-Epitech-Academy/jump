<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { ArrowRight, Clock, Lock, Zap } from '@lucide/svelte';
  import { resolve } from '$app/paths';
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
    isDynamic: boolean;
  };

  type SlotLike = {
    startTime: Date | string;
    endTime: Date | string;
    activity: ActivityLike | null;
  };

  let {
    open = $bindable(false),
    slot,
    hasStarted = false,
  }: {
    open: boolean;
    slot: SlotLike | null;
    hasStarted?: boolean;
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

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    {#if activity && slot}
      <Dialog.Header>
        <Dialog.Title class="text-lg leading-tight break-words">
          {activity.nom}
        </Dialog.Title>
        <Dialog.Description class="flex flex-wrap items-center gap-1.5 text-xs">
          <span>{formatDate(slot.startTime)}</span>
          <span class="text-muted-foreground/60">·</span>
          <Clock class="h-3 w-3" />
          <span>
            {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
          </span>
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-3">
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
        </div>

        {#if activity.description}
          <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {activity.description}
          </p>
        {/if}

        {#if hasStarted}
          <Button
            href={resolve(`/${activity.id}`)}
            class="w-full rounded-xl bg-epi-blue font-bold text-white shadow-md hover:bg-epi-blue/90"
          >
            Accéder à l'activité
            <ArrowRight class="ml-2 h-4 w-4" />
          </Button>
        {:else}
          <div
            class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950"
          >
            <Lock class="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span class="text-slate-600 dark:text-slate-400">
              Contenu disponible à
              <strong class="text-slate-900 dark:text-white"
                >{formatTime(slot.startTime)}</strong
              >.
            </span>
          </div>
        {/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
