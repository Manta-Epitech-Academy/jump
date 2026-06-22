<script lang="ts">
  import { resolve } from '$app/paths';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import * as Table from '$lib/components/ui/table';
  import { cn } from '$lib/utils';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import type { BilanRow } from '../+page.server';

  let { rows }: { rows: BilanRow[] } = $props();

  let searchQuery = $state('');
  let statut = $state<'all' | 'responded' | 'pending'>('all');
  let sortKey = $state<string>('nom');
  let sortDir = $state<SortDir>('asc');

  const columns: ColumnDef[] = [
    { key: 'avatar', label: '', class: 'w-10' },
    { key: 'prenom', label: 'Prénom', sortable: true, class: 'w-40' },
    { key: 'nom', label: 'Nom', sortable: true, class: 'w-full' },
    { key: 'statut', label: 'Réponse', sortable: true, class: 'w-32' },
    { key: 'date', label: 'Le', align: 'right', class: 'w-32' },
  ];

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  function fmtDate(iso: string | null): string {
    return iso ? dateFmt.format(new Date(iso)) : '—';
  }

  function toggleSort(key: string) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  const filtered = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (statut === 'responded' && !r.respondedAt) return false;
      if (statut === 'pending' && r.respondedAt) return false;
      if (!q) return true;
      return `${r.prenom ?? ''} ${r.nom ?? ''}`.toLowerCase().includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      let av: string;
      let bv: string;
      if (sortKey === 'statut') {
        av = a.respondedAt ? '1' : '0';
        bv = b.respondedAt ? '1' : '0';
      } else {
        av = ((a[sortKey as 'nom' | 'prenom'] as string) ?? '').toLowerCase();
        bv = ((b[sortKey as 'nom' | 'prenom'] as string) ?? '').toLowerCase();
      }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return out;
  });

  const statutOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'responded', label: 'A répondu' },
    { value: 'pending', label: 'En attente' },
  ];
</script>

<div class="space-y-4">
  <DataTableToolbar
    searchValue={searchQuery}
    onSearchInput={(v) => (searchQuery = v)}
    searchPlaceholder="Rechercher un stagiaire…"
    count={filtered.length}
    countNoun="stagiaire"
    countNounPlural="stagiaires"
    countSuffix="correspondent aux filtres"
  >
    {#snippet filters()}
      <FilterSelect
        ariaLabel="Réponse"
        value={statut}
        options={statutOptions}
        onChange={(v) => (statut = v as typeof statut)}
      />
    {/snippet}
  </DataTableToolbar>

  <SortableTable
    {columns}
    rows={filtered}
    {sortKey}
    {sortDir}
    onSort={toggleSort}
    rowKey={(r) => r.talentId}
    rowHref={(r) => resolve(`/staff/dev/students/${r.talentId}`)}
    row={rowSnippet}
    mobileRow={mobileRowSnippet}
  />
</div>

{#snippet statutBadge(r: BilanRow)}
  {#if r.respondedAt}
    <span
      class="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    >
      <Check class="h-3 w-3" /> Répondu
    </span>
  {:else}
    <span
      class="inline-flex items-center gap-1 rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800"
    >
      <Clock class="h-3 w-3" /> En attente
    </span>
  {/if}
{/snippet}

{#snippet rowSnippet(r: BilanRow)}
  <Table.Cell class="w-10">
    <TalentAvatar
      talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
      size="sm"
    />
  </Table.Cell>
  <Table.Cell class="font-medium">{r.prenom ?? '—'}</Table.Cell>
  <Table.Cell>{r.nom ?? '—'}</Table.Cell>
  <Table.Cell>{@render statutBadge(r)}</Table.Cell>
  <Table.Cell class="text-right font-mono text-xs text-muted-foreground">
    {fmtDate(r.respondedAt)}
  </Table.Cell>
{/snippet}

{#snippet mobileRowSnippet(r: BilanRow)}
  <div class={cn('flex items-center gap-3 p-3')}>
    <TalentAvatar
      talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
      size="sm"
    />
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium">
        {r.prenom ?? ''}
        {r.nom ?? ''}
      </p>
      <p class="text-xs text-muted-foreground">{fmtDate(r.respondedAt)}</p>
    </div>
    {@render statutBadge(r)}
  </div>
{/snippet}
