<script lang="ts">
  import type { Activity } from '@prisma/client';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import {
    Trash2,
    Zap,
    FileText,
    ExternalLink,
    ClipboardCheck,
  } from '@lucide/svelte';
  import { activityTypeLabels } from '$lib/validation/templates';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { resolve } from '$app/paths';

  let {
    activity,
    eventId,
  }: {
    activity: Activity;
    eventId: string;
  } = $props();

  let deleteOpen = $state(false);

  const difficultyColors: Record<string, string> = {
    Débutant:
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    Intermédiaire:
      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    Avancé:
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
</script>

<div
  class="group relative flex min-w-48 flex-col gap-2 rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm"
>
  <div class="flex items-start justify-between gap-2">
    <div class="flex items-center gap-1.5">
      {#if activity.isDynamic}
        <Zap class="h-3.5 w-3.5 text-epi-orange" />
      {:else}
        <FileText class="h-3.5 w-3.5 text-muted-foreground" />
      {/if}
      <span class="text-sm leading-tight font-medium">{activity.nom}</span>
      {#if activity.link}
        <a
          href={activity.link}
          target="_blank"
          rel="noopener noreferrer"
          class="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink class="h-3 w-3" />
        </a>
      {/if}
    </div>
    <Button
      variant="ghost"
      size="icon"
      class="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
      onclick={() => (deleteOpen = true)}
    >
      <Trash2 class="h-3.5 w-3.5 text-destructive" />
    </Button>
  </div>

  <div class="flex flex-wrap gap-1">
    <Badge variant="outline" class="text-[10px]">
      {activityTypeLabels[
        activity.activityType as keyof typeof activityTypeLabels
      ] || activity.activityType}
    </Badge>
    {#if activity.difficulte}
      <span
        class={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${difficultyColors[activity.difficulte] || ''}`}
      >
        {activity.difficulte}
      </span>
    {/if}
    {#if activity.isDynamic}
      <Badge variant="secondary" class="text-[10px]">Dynamique</Badge>
    {/if}
  </div>

  {#if activity.activityType === 'orga'}
    <a
      href={resolve(`/staff/dev/events/${eventId}/appel/${activity.id}`)}
      class="flex items-center gap-1.5 rounded-md bg-epi-teal/10 px-2.5 py-1.5 text-xs font-bold text-teal-700 transition-colors hover:bg-epi-teal hover:text-black dark:text-epi-teal dark:hover:text-black"
    >
      <ClipboardCheck class="h-3.5 w-3.5" />
      Faire l'appel
    </a>
  {/if}
</div>

<ConfirmDeleteDialog
  bind:open={deleteOpen}
  action="?/deleteActivity&id={activity.id}"
  title="Supprimer cette activité ?"
  description="L'activité « {activity.nom} » sera supprimée définitivement."
/>
