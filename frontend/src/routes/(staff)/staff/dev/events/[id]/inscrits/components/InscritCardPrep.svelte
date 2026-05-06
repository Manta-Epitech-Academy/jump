<script lang="ts">
  import { resolve } from '$app/paths';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import TalentName from '$lib/components/students/TalentName.svelte';
  import NewTalentBadge from '$lib/components/students/NewTalentBadge.svelte';
  import { cn } from '$lib/utils';
  import type { PrepRow } from './types';
  import { humanizeNiveau } from './niveau';

  let { row }: { row: PrepRow } = $props();

  const talent = $derived(row.participation.talent);
  const interests = $derived(talent?.interests ?? []);
  const visibleInterests = $derived(interests.slice(0, 3));
  const overflow = $derived(Math.max(0, interests.length - 3));

  const isNewTalent = $derived((talent?.eventsCount ?? 0) === 0);

  type Tile = { label: string; ok: boolean };
  const tiles = $derived<Tile[]>([
    { label: 'Compte plateforme', ok: row.hasAccount },
    { label: '1ère connexion', ok: row.hasFirstLogin },
    { label: 'Profil complété', ok: row.hasCompletedProfile },
  ]);
</script>

<a
  href={resolve(`/staff/dev/students/${talent?.id}`)}
  class="group flex flex-col gap-3 overflow-hidden rounded-sm border bg-card p-4 shadow-sm transition-all hover:border-epi-blue/50 hover:shadow-md dark:border-border/50 dark:shadow-none"
>
  <div class="flex items-start gap-3">
    <TalentAvatar
      talent={{
        id: talent?.id ?? '',
        nom: talent?.nom,
        prenom: talent?.prenom,
      }}
      size="lg"
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-start gap-2">
        <span
          class="block min-w-0 truncate text-sm font-bold transition-colors group-hover:text-epi-blue"
        >
          <TalentName talent={talent ?? {}} />
        </span>
        {#if isNewTalent}
          <NewTalentBadge />
        {/if}
      </div>
      {#if talent?.lycee || talent?.niveau}
        <p class="mt-0.5 truncate text-xs text-muted-foreground">
          {#if talent?.lycee}{talent.lycee.nom}{/if}
          {#if talent?.lycee && talent?.niveau}<span aria-hidden="true">
              ·
            </span>{/if}
          {#if talent?.niveau}{humanizeNiveau(talent.niveau)}{/if}
        </p>
      {/if}
    </div>
  </div>

  {#if visibleInterests.length > 0}
    <div class="flex flex-wrap items-center gap-1">
      {#each visibleInterests as ti (ti.interestId)}
        <span
          class="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          {ti.interest.label}
        </span>
      {/each}
      {#if overflow > 0}
        <span
          class="rounded-sm px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          +{overflow}
        </span>
      {/if}
    </div>
  {/if}

  <div class="border-t border-border/60"></div>

  <ul class="space-y-1">
    {#each tiles as tile (tile.label)}
      <li
        class={cn(
          'flex items-center gap-2 rounded-sm px-2 py-1 text-[11px]',
          tile.ok
            ? 'bg-green-50 text-green-700 dark:bg-green-900/15 dark:text-green-300'
            : 'bg-muted/50 text-muted-foreground',
        )}
      >
        {#if tile.ok}
          <Check class="h-3 w-3 shrink-0" />
        {:else}
          <X class="h-3 w-3 shrink-0 text-destructive/60" />
        {/if}
        <span class="font-medium">{tile.label}</span>
      </li>
    {/each}
  </ul>
</a>
