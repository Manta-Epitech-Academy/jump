<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import * as Table from '$lib/components/ui/table';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import Pagination from '$lib/components/staff/datatable/Pagination.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import ActiveFilterChips, {
    type ActiveFilterChip,
  } from '$lib/components/staff/ActiveFilterChips.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import {
    nextSort,
    rowComparator,
  } from '$lib/components/staff/datatable/sort';
  import {
    pageCount,
    paginate,
  } from '$lib/components/staff/datatable/paginate';
  import {
    statusBadgeClass,
    type StatusTone,
  } from '$lib/components/staff/statusBadge';
  import SalesforceIconLink from '$lib/components/salesforce/SalesforceIconLink.svelte';
  import { adminTalentHref } from '$lib/components/admin/adminTalentHref';
  import { formatDateTimeFr } from '$lib/utils';
  import { natureLabel } from '$lib/domain/authIdentity';
  import {
    REMEDY_WHO_LABELS,
    SYNC_ERROR_KIND_LABELS,
    SYNC_ERROR_KINDS,
    type SyncErrorKind,
    type SyncErrorRemedy,
  } from '$lib/domain/syncError';
  import type { PageData } from '../$types';

  type Row = Awaited<PageData['queue']>[number];
  type SortKey = 'talent' | 'since' | 'last';

  let { rows }: { rows: Row[] } = $props();

  const PER_PAGE = 25;

  let searchQuery = $state('');
  let kinds = $state<SyncErrorKind[]>([]);
  let sortKey = $state<SortKey>('since');
  let sortDir = $state<SortDir>('asc');
  let page = $state(1);

  // Who can act decides how loud the remedy reads: nobody can is the one an
  // admin must not go looking for a fix for.
  const REMEDY_TONE: Record<SyncErrorRemedy['who'], StatusTone> = {
    salesforce: 'warning',
    jump: 'warning',
    developer: 'warning',
    automatic: 'neutral',
    none: 'danger',
  };

  const kindCounts = $derived(
    SYNC_ERROR_KINDS.map((k) => ({
      value: k,
      label: SYNC_ERROR_KIND_LABELS[k],
      count: rows.filter((r) => r.kind === k).length,
    })),
  );

  const columns: ColumnDef[] = $derived([
    { key: 'talent', label: 'Talent', sortable: true, class: 'w-48' },
    {
      key: 'problem',
      label: 'Problème',
      class: 'w-full',
      filter: {
        options: kindCounts,
        selected: kinds,
        onChange: (values) => {
          kinds = values as SyncErrorKind[];
          page = 1;
        },
      },
    },
    { key: 'holder', label: 'En cause', class: 'w-48' },
    { key: 'remedy', label: 'Correction', class: 'w-72' },
    {
      key: 'since',
      label: 'Depuis',
      sortable: true,
      class: 'w-32',
    },
    {
      key: 'last',
      label: 'Dernière fois',
      sortable: true,
      defaultSortDir: 'desc',
      class: 'w-32',
    },
  ]);

  function toggleSort(key: string) {
    const next = nextSort(columns, { key: sortKey, dir: sortDir }, key);
    sortKey = next.key as SortKey;
    sortDir = next.dir;
  }

  const subjectName = (r: Row) =>
    `${r.subject.prenom} ${r.subject.nom}`.trim() || 'Contact sans nom';

  function compareRows(a: Row, b: Row, key: SortKey): number {
    switch (key) {
      case 'talent':
        return subjectName(a).localeCompare(subjectName(b), 'fr');
      case 'since':
        return a.firstOccurredAt.getTime() - b.firstOccurredAt.getTime();
      case 'last':
        return a.lastOccurredAt.getTime() - b.lastOccurredAt.getTime();
    }
  }

  // The talent a holder leads to: the other talent, or a parent's child.
  function holderTalent(r: Row): { prenom: string; nom: string } | null {
    const h = r.holder;
    if (h?.kind === 'talent') return h;
    if (h?.kind === 'parent') return h.child;
    return null;
  }

  function holderName(r: Row): string | null {
    const t = holderTalent(r);
    if (t) return `${t.prenom} ${t.nom}`;
    return r.holder?.kind === 'staff' ? r.holder.name : null;
  }

  const filtered = $derived.by(() => {
    const tokens = searchTokens(searchQuery);
    const out = rows.filter((r) => {
      if (kinds.length > 0 && !kinds.includes(r.kind)) return false;
      return matchesAllTokens(
        buildHaystack([
          r.subject.prenom,
          r.subject.nom,
          r.subject.loginEmail,
          r.subject.sfEmail,
          r.subject.externalId,
          holderName(r),
          ...r.records.map((t) => `${t.prenom} ${t.nom}`),
        ]),
        tokens,
      );
    });
    out.sort(
      rowComparator({
        compare: (a, b) => compareRows(a, b, sortKey),
        dir: sortDir,
      }),
    );
    return out;
  });

  const visible = $derived(paginate(filtered, page, PER_PAGE));
  const totalPages = $derived(pageCount(filtered.length, PER_PAGE));
  const filtersApplied = $derived(
    searchQuery.trim().length > 0 || kinds.length > 0,
  );

  const chips: ActiveFilterChip[] = $derived(
    kinds.map((k) => ({
      id: `kind:${k}`,
      facet: 'Problème',
      label: SYNC_ERROR_KIND_LABELS[k],
      onRemove: () => {
        kinds = kinds.filter((x) => x !== k);
        page = 1;
      },
    })),
  );

  function resetFilters() {
    kinds = [];
    searchQuery = '';
    page = 1;
  }

  const subjectHref = (r: Row) =>
    r.subject.talentId
      ? adminTalentHref({
          email: r.subject.loginEmail,
          prenom: r.subject.prenom,
          nom: r.subject.nom,
        })
      : null;

  // A talent whose account holds the address logs in with it, and the address
  // finds that one talent where its name finds every homonym (the subject
  // itself, when one person is recorded twice). A guardian's child, or a
  // talent the address is only the Salesforce address of, is found by name.
  const holderHref = (r: Row) => {
    const t = holderTalent(r);
    if (!t) return null;
    const login =
      r.holder?.kind === 'talent' && r.holder.linked ? r.subject.sfEmail : null;
    return adminTalentHref({ email: login, prenom: t.prenom, nom: t.nom });
  };
</script>

{#snippet subject(r: Row)}
  {@const href = subjectHref(r)}
  <div class="min-w-0 space-y-0.5">
    <span class="flex min-w-0 items-center gap-1.5">
      {#if href}
        <a {href} class="cursor-pointer font-bold hover:underline"
          >{subjectName(r)}</a
        >
      {:else}
        <span class="font-bold">{subjectName(r)}</span>
      {/if}
      <SalesforceIconLink
        externalId={r.subject.externalId}
        label="Ouvrir le contact dans Salesforce"
        class="shrink-0"
      />
    </span>
    {#if r.subject.sfEmail}
      <span class="block font-mono text-xs break-all text-muted-foreground"
        >{r.subject.sfEmail}</span
      >
    {/if}
  </div>
{/snippet}

{#snippet problem(r: Row)}
  <div class="space-y-1">
    <span class="flex items-center gap-1 font-semibold">
      {r.explanation.label}
      <InfoTooltip
        text={r.explanation.whatHappened}
        label="Ce qui s'est passé"
      />
    </span>
    <p class="text-sm text-foreground-secondary">
      {r.explanation.consequence}
    </p>
  </div>
{/snippet}

{#snippet holder(r: Row)}
  {@const href = holderHref(r)}
  {#if r.records.length > 0}
    <!-- A refused merge: every fiche Jump holds for the person, to compare. -->
    <ul class="space-y-0.5">
      {#each r.records as t (t.talentId)}
        <li>
          <span class="flex items-center gap-1.5">
            <a
              href={adminTalentHref({
                email: t.loginEmail,
                prenom: t.prenom,
                nom: t.nom,
              })}
              class="cursor-pointer text-sm hover:underline"
              >{t.prenom} {t.nom}</a
            >
            <SalesforceIconLink
              externalId={t.externalId}
              label="Ouvrir cette fiche dans Salesforce"
              class="shrink-0"
            />
          </span>
          {#if t.loginEmail}
            <span
              class="block font-mono text-xs break-all text-muted-foreground"
              >{t.loginEmail}</span
            >
          {/if}
        </li>
      {/each}
    </ul>
  {:else if r.holder}
    {#if href}
      <a {href} class="cursor-pointer text-sm hover:underline"
        >{natureLabel(r.holder)}</a
      >
    {:else}
      <span class="text-sm">{natureLabel(r.holder)}</span>
    {/if}
  {:else}
    <span class="text-muted-foreground">-</span>
  {/if}
{/snippet}

{#snippet remedy(r: Row)}
  {@const fix = r.explanation.remedy}
  <div class="space-y-1">
    <span class={statusBadgeClass(REMEDY_TONE[fix.who])}>
      {REMEDY_WHO_LABELS[fix.who]}
    </span>
    <p class="text-sm">
      {fix.text}
      {#if fix.who === 'jump'}
        <a
          href={fix.href}
          class="inline-flex cursor-pointer items-center gap-0.5 font-semibold text-epi-blue hover:underline"
          >Ouvrir <ExternalLink class="h-3 w-3" /></a
        >
      {/if}
    </p>
    {#if r.detail}
      <Collapsible.Root>
        <Collapsible.Trigger
          class="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Détail technique
          <ChevronDown class="h-3 w-3" />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <p
            class="mt-1 font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground"
          >
            {r.detail}
          </p>
        </Collapsible.Content>
      </Collapsible.Root>
    {/if}
  </div>
{/snippet}

{#if rows.length === 0}
  <ResultsNotice
    icon={CircleCheck}
    title="Aucune erreur de synchronisation"
    description="Le dernier passage a repris chaque contact et chaque compte de connexion."
  />
{:else}
  <div class="space-y-4">
    <DataTableToolbar
      searchValue={searchQuery}
      onSearchInput={(v) => {
        searchQuery = v;
        page = 1;
      }}
      searchPlaceholder="Rechercher un talent ou une adresse…"
      count={filtered.length}
      countNoun="erreur"
      {filtersApplied}
    />

    <ActiveFilterChips {chips} onReset={resetFilters} />

    <SortableTable
      {columns}
      rows={visible}
      {sortKey}
      {sortDir}
      onSort={toggleSort}
      rowKey={(r) => r.id}
      layout="fixed"
      cardsBelow="xl"
      stickyHeader
    >
      {#snippet row(r: Row)}
        <Table.Cell class="align-top whitespace-normal"
          >{@render subject(r)}</Table.Cell
        >
        <Table.Cell class="align-top whitespace-normal"
          >{@render problem(r)}</Table.Cell
        >
        <Table.Cell class="align-top whitespace-normal"
          >{@render holder(r)}</Table.Cell
        >
        <Table.Cell class="align-top whitespace-normal"
          >{@render remedy(r)}</Table.Cell
        >
        <Table.Cell class="align-top text-sm text-muted-foreground">
          {formatDateTimeFr(r.firstOccurredAt)}
        </Table.Cell>
        <Table.Cell class="align-top text-sm text-muted-foreground">
          {formatDateTimeFr(r.lastOccurredAt)}
        </Table.Cell>
      {/snippet}

      {#snippet mobileRow(r: Row)}
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-3">
            {@render subject(r)}
            <span class="shrink-0 text-xs text-muted-foreground">
              depuis {formatDateTimeFr(r.firstOccurredAt)}
            </span>
          </div>
          {@render problem(r)}
          {#if r.holder || r.records.length > 0}
            <div class="flex items-baseline gap-2">
              <span class="epi-overline text-muted-foreground">En cause</span>
              {@render holder(r)}
            </div>
          {/if}
          {@render remedy(r)}
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

    <Pagination {page} {totalPages} onPageChange={(p) => (page = p)} />
  </div>
{/if}
