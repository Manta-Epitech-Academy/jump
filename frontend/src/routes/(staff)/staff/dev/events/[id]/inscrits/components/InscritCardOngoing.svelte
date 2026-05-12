<script lang="ts">
  import { resolve } from '$app/paths';
  import Trophy from '@lucide/svelte/icons/trophy';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Activity from '@lucide/svelte/icons/activity';
  import { Badge } from '$lib/components/ui/badge';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import TalentName from '$lib/components/students/TalentName.svelte';
  import NewTalentBadge from '$lib/components/students/NewTalentBadge.svelte';
  import { cn, formatDateFr } from '$lib/utils';
  import { INTERVIEW_DISPLAY_LABELS } from '$lib/domain/interview';
  import type { OngoingRow } from './types';
  import { humanizeNiveau } from './niveau';
  import RecommendationChip from '../../interviews/components/RecommendationChip.svelte';

  let {
    row,
    timezone,
    mode = 'live',
  }: {
    row: OngoingRow;
    timezone: string;
    mode?: 'live' | 'recap';
  } = $props();

  const talent = $derived(row.participation.talent);
  const interests = $derived(talent?.interests ?? []);
  const visibleInterests = $derived(interests.slice(0, 3));
  const overflow = $derived(Math.max(0, interests.length - 3));

  const isNewTalent = $derived.by(() => {
    const count = talent?.eventsCount ?? 0;
    const isPresent = row.participation.isPresent ? 1 : 0;
    return count - isPresent === 0;
  });

  const interviewChipClass = $derived(
    {
      none: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
      planned:
        'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300',
      overdue:
        'border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15',
      done: 'border-green-300 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300',
      cancelled: 'border-border bg-muted text-muted-foreground line-through',
    }[row.interviewStatus],
  );

  const interviewLabel = $derived.by(() => {
    const base = INTERVIEW_DISPLAY_LABELS[row.interviewStatus];
    if (row.interviewStatus === 'planned' && row.interviewDate) {
      return `${base} · ${formatDateFr(row.interviewDate, timezone)}`;
    }
    return base;
  });

  const presenceTone = $derived(
    row.participation.isPresent
      ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
      : 'border-border bg-muted text-muted-foreground',
  );

  const presenceLabel = $derived(
    mode === 'recap'
      ? row.participation.isPresent
        ? 'Présent au stage'
        : 'Absent au stage'
      : row.participation.isPresent
        ? 'Présent'
        : 'Pas encore vu',
  );

  const lastActivityLabel = $derived.by(() => {
    if (!row.lastActivityName || !row.lastActivityAt) return null;
    return `${row.lastActivityName} · ${formatDateFr(row.lastActivityAt, timezone)}`;
  });
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
      {#if talent?.highSchoolName || talent?.niveau}
        <p class="mt-0.5 truncate text-xs text-muted-foreground">
          {#if talent?.highSchoolName}{talent.highSchoolName}{/if}
          {#if talent?.highSchoolName && talent?.niveau}<span
              aria-hidden="true"
            >
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
          {#if ti.interest.emoji}<span aria-hidden="true"
              >{ti.interest.emoji}</span
            >{/if}
          {ti.interest.nom}
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

  <div class="flex items-center gap-2 text-xs text-muted-foreground">
    <Trophy class="h-3.5 w-3.5 text-epi-orange" />
    <span class="font-mono font-bold text-foreground">
      {talent?.xp ?? 0}
    </span>
    <span>XP</span>
  </div>

  {#if lastActivityLabel}
    <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
      <Activity class="h-3 w-3 shrink-0 text-epi-blue" />
      <span class="truncate">{lastActivityLabel}</span>
    </div>
  {:else if mode === 'live'}
    <p class="text-[11px] text-muted-foreground italic">
      Aucune activité enregistrée
    </p>
  {/if}

  <div class="flex flex-wrap items-center gap-1.5">
    <Badge
      variant="outline"
      class={cn(
        'rounded-sm px-1.5 py-0 text-[10px] font-bold uppercase',
        presenceTone,
      )}
    >
      {presenceLabel}
    </Badge>
    <Badge
      variant="outline"
      class={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0 text-[10px] font-bold uppercase',
        interviewChipClass,
      )}
    >
      <MessageSquare class="h-2.5 w-2.5" />
      {interviewLabel}
    </Badge>
    {#if row.interviewRecommendation}
      <RecommendationChip value={row.interviewRecommendation} />
    {/if}
  </div>
</a>
