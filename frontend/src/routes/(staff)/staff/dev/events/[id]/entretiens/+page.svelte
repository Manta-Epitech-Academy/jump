<script lang="ts">
  import { resolve } from '$app/paths';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import Circle from '@lucide/svelte/icons/circle';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import * as Table from '$lib/components/ui/table';
  import { cn } from '$lib/utils';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import SegmentedFilter, {
    type SegmentOption,
  } from '$lib/components/staff/SegmentedFilter.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import * as Avatar from '$lib/components/ui/avatar';
  import { getInitials } from '$lib/avatar';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import { formatGivenName } from '$lib/domain/profile';
  import {
    INTERVIEW_STATUS_LABELS,
    INTERVIEW_STATUS_CHIP_CLASS,
    type InterviewListStatus,
  } from '$lib/domain/interview';
  import type { FlagKey } from '$lib/domain/featureFlags';
  import type { EntretienRow, SortKey } from './components/types';
  import SynthesisCard from './components/SynthesisCard.svelte';
  import TopInterviewersCard from './components/TopInterviewersCard.svelte';
  import GuideCard from '$lib/components/dev/interviews/GuideCard.svelte';

  let { data }: { data: PageData } = $props();

  const hasCodingClub = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]).has('coding_club'),
  );

  const STATUS_ICON: Record<InterviewListStatus, typeof Check> = {
    todo: Circle,
    in_progress: Clock,
    done: Check,
  };
  // Least-advanced first in ascending sort, so the talents still to call float up.
  const STATUS_ORDER: Record<InterviewListStatus, number> = {
    todo: 0,
    in_progress: 1,
    done: 2,
  };

  let searchQuery = $state('');
  let statutFilter = $state<'all' | InterviewListStatus>('all');
  let sortKey = $state<SortKey>('nom');
  let sortDir = $state<SortDir>('asc');

  const columns: ColumnDef[] = [
    { key: 'avatar', label: '', class: 'w-12' },
    { key: 'prenom', label: 'Prénom', sortable: true, class: 'w-28' },
    { key: 'nom', label: 'Nom', sortable: true, class: 'w-36' },
    {
      key: 'interviewer',
      label: 'Interviewer',
      sortable: true,
      class: 'w-full',
    },
    { key: 'date', label: 'Date', sortable: true, class: 'w-28' },
    { key: 'status', label: 'Statut', sortable: true, class: 'w-28' },
  ];

  const statutOptions: SegmentOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'todo', label: INTERVIEW_STATUS_LABELS.todo },
    { value: 'in_progress', label: INTERVIEW_STATUS_LABELS.in_progress },
    { value: 'done', label: INTERVIEW_STATUS_LABELS.done },
  ];

  function toggleSort(key: string) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key as SortKey;
      sortDir = 'asc';
    }
  }

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const dateFmt = (d: Date | string | null) =>
    d
      ? new Date(d).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'short',
          timeZone: data.timezone,
        })
      : null;

  function compareRows(a: EntretienRow, b: EntretienRow, key: SortKey): number {
    switch (key) {
      case 'prenom':
        return a.prenom.localeCompare(b.prenom, 'fr');
      case 'nom':
        return a.nom.localeCompare(b.nom, 'fr');
      case 'interviewer':
        // Conducted interviews (named) sort before the not-yet-assigned.
        if (!a.interviewerName && !b.interviewerName) return 0;
        if (!a.interviewerName) return 1;
        if (!b.interviewerName) return -1;
        return a.interviewerName.localeCompare(b.interviewerName, 'fr');
      case 'date': {
        const ta = a.conductedAt ? new Date(a.conductedAt).getTime() : null;
        const tb = b.conductedAt ? new Date(b.conductedAt).getTime() : null;
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return ta - tb;
      }
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
  }

  const filtered = $derived.by(() => {
    const tokens = norm(searchQuery).split(/\s+/).filter(Boolean);
    const out = data.rows.filter((r) => {
      if (statutFilter !== 'all' && r.status !== statutFilter) return false;
      if (tokens.length === 0) return true;
      const h = norm(`${r.prenom} ${r.nom} ${r.interviewerName ?? ''}`);
      return tokens.every((tok) => h.includes(tok));
    });
    out.sort((a, b) => {
      const c = compareRows(a, b, sortKey);
      return sortDir === 'asc' ? c : -c;
    });
    return out;
  });

  const anyFiltersApplied = $derived(
    searchQuery.trim().length > 0 || statutFilter !== 'all',
  );
  const countSuffix = $derived(
    anyFiltersApplied
      ? filtered.length > 1
        ? 'correspondent aux filtres'
        : 'correspond aux filtres'
      : 'au total',
  );

  const ficheHref = (r: EntretienRow) =>
    resolve(`/staff/dev/students/${r.talentId}`) + '?interview=1';
</script>

<svelte:head>
  <title>{STAGE_SECONDE_LABEL} — Entretiens</title>
</svelte:head>

{#snippet statusBadge(status: InterviewListStatus, full: boolean)}
  {@const Icon = STATUS_ICON[status]}
  <span
    class={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
      full && 'shrink-0',
      INTERVIEW_STATUS_CHIP_CLASS[status],
    )}
  >
    <Icon class="h-3 w-3" />
    {INTERVIEW_STATUS_LABELS[status]}
  </span>
{/snippet}

{#snippet interviewerAvatar(name: string, image: string | null)}
  <Avatar.Root class="h-6 w-6 shrink-0">
    <Avatar.Image src={image ?? undefined} alt={name} class="object-cover" />
    <Avatar.Fallback class="bg-epi-blue/10 text-[9px] font-bold text-epi-blue">
      {getInitials(name)}
    </Avatar.Fallback>
  </Avatar.Root>
{/snippet}

<div class="space-y-6 pb-10">
  {#if hasCodingClub}
    <PageBreadcrumb
      items={[
        {
          label: STAGE_SECONDE_LABEL,
          href: resolve(`/staff/dev/events/${data.event.id}`),
        },
        { label: 'Entretiens' },
      ]}
    />
  {/if}
  <PageHeader title="Entretiens" />

  {#if data.total === 0}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <MessageSquare class="h-10 w-10 text-muted-foreground opacity-30" />
      <h3
        class="mt-4 text-sm font-bold tracking-widest text-foreground uppercase"
      >
        Aucun stagiaire inscrit
      </h3>
      <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
        Les entretiens apparaîtront ici dès que la cohorte du stage sera
        synchronisée.
      </p>
    </div>
  {:else}
    <div class="grid gap-6 xl:grid-cols-10">
      <!-- Left 70%: the working list. `min-w-0` lets the fixed-layout table
           shrink to its grid track instead of overflowing past the rail. -->
      <div class="min-w-0 space-y-4 xl:col-span-7">
        <DataTableToolbar
          searchValue={searchQuery}
          onSearchInput={(v) => (searchQuery = v)}
          searchPlaceholder="Rechercher un stagiaire…"
          searchWidthClass="max-w-[230px]"
          filtersAlign="end"
          count={filtered.length}
          countNoun="entretien"
          {countSuffix}
        >
          {#snippet filters()}
            <div class="flex items-center gap-2">
              <span
                class="hidden text-[10px] font-bold tracking-widest text-muted-foreground uppercase sm:inline"
              >
                Statut
              </span>
              <SegmentedFilter
                ariaLabel="Filtrer par statut d'entretien"
                options={statutOptions}
                value={statutFilter}
                onChange={(v) => (statutFilter = v as typeof statutFilter)}
              />
            </div>
          {/snippet}
        </DataTableToolbar>

        <SortableTable
          {columns}
          rows={filtered}
          {sortKey}
          {sortDir}
          onSort={toggleSort}
          rowKey={(r) => r.participationId}
          rowHref={ficheHref}
          rowLabel={(r) => `Mener l'entretien de ${r.prenom} ${r.nom}`}
          stickyHeader
          layout="fixed"
        >
          {#snippet row(r: EntretienRow)}
            <Table.Cell>
              <TalentAvatar
                talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
                size="sm"
              />
            </Table.Cell>
            <Table.Cell class="font-medium">
              {@const prenom = formatGivenName(r.prenom)}
              <span class="block truncate" title={prenom}>{prenom}</span>
            </Table.Cell>
            <Table.Cell class="font-bold uppercase">
              <span class="block truncate" title={r.nom}>{r.nom}</span>
            </Table.Cell>
            <Table.Cell class="text-sm">
              {#if r.interviewerName}
                <span class="flex min-w-0 items-center gap-2">
                  {@render interviewerAvatar(
                    r.interviewerName,
                    r.interviewerImage,
                  )}
                  <span class="truncate" title={r.interviewerName}>
                    {r.interviewerName}
                  </span>
                </span>
              {:else}
                <span class="text-muted-foreground">—</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="text-sm text-muted-foreground tabular-nums">
              {dateFmt(r.conductedAt) ?? '—'}
            </Table.Cell>
            <Table.Cell>
              {@render statusBadge(r.status, false)}
            </Table.Cell>
          {/snippet}

          {#snippet mobileRow(r: EntretienRow)}
            {@const prenom = formatGivenName(r.prenom)}
            <div class="flex items-start gap-3">
              <TalentAvatar
                talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
                size="sm"
              />
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex items-start justify-between gap-2">
                  <p class="min-w-0 truncate text-sm">
                    <span class="font-medium">{prenom}</span>
                    <span class="font-bold uppercase">{r.nom}</span>
                  </p>
                  {@render statusBadge(r.status, true)}
                </div>
                <div
                  class="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  {#if r.interviewerName}
                    {@render interviewerAvatar(
                      r.interviewerName,
                      r.interviewerImage,
                    )}
                  {/if}
                  <span class="min-w-0 flex-1 truncate">
                    {r.interviewerName ?? 'Pas encore mené'}
                  </span>
                  {#if r.conductedAt}
                    <span class="shrink-0 tabular-nums"
                      >{dateFmt(r.conductedAt)}</span
                    >
                  {/if}
                </div>
              </div>
            </div>
          {/snippet}

          {#snippet empty()}
            <div class="flex flex-col items-center gap-3 py-6">
              <span
                class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >
                Aucun résultat
              </span>
            </div>
          {/snippet}
        </SortableTable>
      </div>

      <!-- Right 30%: synthesis, top interviewers and the interview guide. Same
           sticky-rail mechanics as Inscrits / Émargement. -->
      <aside class="min-w-0 xl:col-span-3">
        <div
          class="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-6rem)] xl:grid-cols-1 xl:overflow-y-auto xl:pr-1"
        >
          <SynthesisCard
            counts={data.counts}
            total={data.total}
            recoCounts={data.recoCounts}
          />
          <TopInterviewersCard
            interviewers={data.topInterviewers}
            currentStaffId={data.currentStaffId}
          />
          <GuideCard />
        </div>
      </aside>
    </div>
  {/if}
</div>
