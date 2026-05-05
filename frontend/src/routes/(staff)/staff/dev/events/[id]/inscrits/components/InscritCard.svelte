<script lang="ts">
  import { resolve } from '$app/paths';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Trophy from '@lucide/svelte/icons/trophy';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Laptop from '@lucide/svelte/icons/laptop';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import TalentName from '$lib/components/students/TalentName.svelte';
  import NewTalentBadge from '$lib/components/students/NewTalentBadge.svelte';
  import { formatDateFr } from '$lib/utils';
  import type { ParticipationWithTalent, LastEvent } from './types';
  import { humanizeNiveau } from './niveau';

  let {
    participation,
    lastEvent,
    timezone,
    showPcTodo,
    onDelete,
  }: {
    participation: ParticipationWithTalent;
    lastEvent: LastEvent | null;
    timezone: string;
    showPcTodo: boolean;
    onDelete: (id: string) => void;
  } = $props();

  let isNewStudent = $derived.by(() => {
    const count = participation.talent?.eventsCount ?? 0;
    const isPresent = participation.isPresent ? 1 : 0;
    return count - isPresent === 0;
  });

  let humanNiveau = $derived(humanizeNiveau(participation.talent?.niveau));
</script>

<div
  class="group relative flex flex-col overflow-hidden rounded-sm border bg-card shadow-sm transition-all hover:border-epi-blue/50 hover:shadow-md dark:border-border/50 dark:shadow-none"
>
  <a
    href={resolve(`/staff/dev/students/${participation.talent?.id}`)}
    class="flex flex-1 flex-col gap-3 p-4"
  >
    <div class="flex items-start gap-3">
      <TalentAvatar
        talent={{
          id: participation.talent?.id ?? '',
          nom: participation.talent?.nom,
          prenom: participation.talent?.prenom,
        }}
        size="lg"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-start gap-2">
          <span
            class="block min-w-0 truncate text-sm font-bold transition-colors group-hover:text-epi-blue"
          >
            <TalentName talent={participation.talent ?? {}} />
          </span>
          {#if isNewStudent}
            <NewTalentBadge />
          {/if}
          {#if showPcTodo}
            <Badge
              variant="outline"
              class="shrink-0 gap-1 border-purple-200 bg-purple-50 px-1 py-0 text-[9px] tracking-widest text-purple-700 uppercase dark:border-purple-900 dark:bg-purple-900/30 dark:text-purple-300"
            >
              <Laptop class="h-2.5 w-2.5" />
              PC à préparer
            </Badge>
          {/if}
        </div>
        {#if humanNiveau}
          <p
            class="mt-0.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            {humanNiveau}
          </p>
        {/if}
        {#if participation.talent?.lycee}
          <p class="mt-0.5 truncate text-xs text-muted-foreground">
            {participation.talent.lycee.nom}
          </p>
        {/if}
      </div>
    </div>

    <p class="text-xs text-muted-foreground">
      <Trophy class="mr-1 inline h-3.5 w-3.5 -translate-y-px text-epi-orange" />
      <span class="font-mono font-bold text-foreground">
        {participation.talent?.xp ?? 0}
      </span>
      XP
      <span aria-hidden="true" class="mx-1">·</span>
      <span class="font-mono font-bold text-foreground">
        {participation.talent?.eventsCount ?? 0}
      </span>
      événement{(participation.talent?.eventsCount ?? 0) > 1 ? 's' : ''}
    </p>

    {#if lastEvent}
      <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Calendar class="h-3 w-3 shrink-0" />
        <span class="truncate">
          <span class="font-bold uppercase">Dernier</span>
          <span aria-hidden="true">·</span>
          <span class="text-foreground">{lastEvent.titre}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDateFr(lastEvent.date, timezone)}</span>
        </span>
      </div>
    {:else}
      <p class="text-[11px] text-muted-foreground italic">Premier événement</p>
    {/if}
  </a>

  <Tooltip.Provider delayDuration={300}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="absolute top-2 right-2 h-7 w-7 cursor-pointer text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
            onclick={() => onDelete(participation.id)}
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p class="font-bold text-destructive uppercase">
          Retirer de l'événement
        </p>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
</div>
