<script lang="ts">
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import Bug from '@lucide/svelte/icons/bug';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import Inbox from '@lucide/svelte/icons/inbox';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { Switch } from '$lib/components/ui/switch';
  import { formatDateTimeFr } from '$lib/utils';
  import { resolve } from '$app/paths';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { TICKET_CATEGORY_LABELS } from '$lib/domain/tickets';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import SegmentedFilter, {
    type SegmentOption,
  } from '$lib/components/staff/SegmentedFilter.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';

  let { data } = $props();

  type TicketRow = (typeof data)['tickets'][number];

  let optimistic = $state<boolean | null>(null);
  let toggling = $state(false);
  let ticketsEnabled = $derived(optimistic ?? data.ticketsEnabled);

  async function handleToggle(next: boolean) {
    if (toggling) return;
    toggling = true;
    optimistic = next;
    try {
      const response = await fetch('/api/admin/tickets-enabled', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error(await response.text());
      await invalidateAll();
      toast.success(next ? 'Tickets activés' : 'Tickets désactivés');
    } catch {
      toast.error('Échec de la mise à jour');
    } finally {
      optimistic = null;
      toggling = false;
    }
  }

  // One table for the whole queue; the open/closed split is a toolbar filter
  // (default Ouverts, the actionable set) rather than two separate tables.
  // Datasets are small, so filter + sort run client-side in memory.
  const openCount = $derived(
    data.tickets.filter((t) => t.status === 'open').length,
  );
  const closedCount = $derived(data.tickets.length - openCount);

  let searchQuery = $state('');
  let statusFilter = $state<'open' | 'closed' | 'all'>('open');
  let sortKey = $state<string | null>('lastMessageAt');
  let sortDir = $state<'asc' | 'desc'>('desc');

  const authorLabel = (t: TicketRow) => t.author.name || t.author.email || '';

  const filtered = $derived(
    data.tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        authorLabel(t).toLowerCase().includes(q)
      );
    }),
  );
  const sorted = $derived.by(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => dir * compare(a, b, sortKey));
  });

  function compare(a: TicketRow, b: TicketRow, key: string | null): number {
    switch (key) {
      case 'category':
        return a.category.localeCompare(b.category, 'fr');
      case 'title':
        return a.title.localeCompare(b.title, 'fr');
      case 'author':
        return authorLabel(a).localeCompare(authorLabel(b), 'fr');
      case 'messages':
        return a.messageCount - b.messageCount;
      case 'lastMessageAt':
        return (
          new Date(a.lastMessageAt).getTime() -
          new Date(b.lastMessageAt).getTime()
        );
      default:
        return 0;
    }
  }

  function toggleSort(key: string) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  const statusOptions: SegmentOption[] = $derived([
    { value: 'open', label: 'Ouverts', count: openCount },
    { value: 'closed', label: 'Clos', count: closedCount },
    { value: 'all', label: 'Tous', count: data.tickets.length },
  ]);

  const columns: ColumnDef[] = [
    { key: 'category', label: 'Type', sortable: true },
    { key: 'title', label: 'Titre', sortable: true },
    { key: 'author', label: 'Auteur', sortable: true },
    { key: 'messages', label: 'Messages', sortable: true, align: 'right' },
    { key: 'lastMessageAt', label: 'Dernier message', sortable: true },
  ];

  const categoryLabel = (c: string) =>
    TICKET_CATEGORY_LABELS[c as keyof typeof TICKET_CATEGORY_LABELS] ?? c;
</script>

<svelte:head>
  <title>Tickets — Admin</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      <span class="text-epi-pink">Tickets</span> staff
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Suggestions et bugs remontés par les équipes
    </p>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2 uppercase">
        <LifeBuoy class="h-4 w-4 text-epi-pink" />
        Activation du système
      </Card.Title>
    </Card.Header>
    <Card.Content>
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-bold">
            {ticketsEnabled ? 'Tickets activés' : 'Tickets désactivés'}
          </p>
          <p class="text-xs text-muted-foreground">
            {#if ticketsEnabled}
              Les dev et pédago peuvent envoyer suggestions et bugs depuis leur
              espace.
            {:else}
              Les dev et pédago ne peuvent plus créer de nouveau ticket. Les
              tickets existants restent visibles ici.
            {/if}
          </p>
        </div>
        <Switch
          checked={ticketsEnabled}
          disabled={toggling}
          onCheckedChange={handleToggle}
        />
      </div>
    </Card.Content>
  </Card.Root>

  <DataTableToolbar
    searchValue={searchQuery}
    onSearchInput={(v) => (searchQuery = v)}
    searchPlaceholder="Rechercher par titre ou auteur…"
    count={sorted.length}
    countNoun="ticket"
  >
    {#snippet filters()}
      <SegmentedFilter
        ariaLabel="Filtrer par statut"
        options={statusOptions}
        value={statusFilter}
        onChange={(v) => (statusFilter = v as 'open' | 'closed' | 'all')}
      />
    {/snippet}
  </DataTableToolbar>

  <SortableTable
    {columns}
    rows={sorted}
    {sortKey}
    {sortDir}
    onSort={toggleSort}
    rowKey={(t) => t.id}
    rowHref={(t) => resolve(`/staff/admin/tickets/${t.id}`)}
    rowLabel={(t) => t.title}
  >
    {#snippet row(ticket)}
      <Table.Cell>
        {#if ticket.category === 'bug'}
          <Badge variant="destructive" class="gap-1">
            <Bug class="h-3 w-3" />
            {TICKET_CATEGORY_LABELS.bug}
          </Badge>
        {:else}
          <Badge variant="secondary" class="gap-1">
            <Lightbulb class="h-3 w-3" />
            {categoryLabel(ticket.category)}
          </Badge>
        {/if}
      </Table.Cell>
      <Table.Cell
        class={ticket.status === 'closed'
          ? 'font-bold text-muted-foreground'
          : 'font-bold'}
      >
        <div class="flex items-center gap-2">
          {#if ticket.unread}
            <span class="h-2 w-2 rounded-full bg-epi-pink"></span>
          {/if}
          {ticket.title}
        </div>
      </Table.Cell>
      <Table.Cell>
        <div class="flex flex-col">
          <span class="text-sm">{ticket.author.name ?? '—'}</span>
          <span class="text-xs text-muted-foreground"
            >{ticket.author.email}</span
          >
        </div>
      </Table.Cell>
      <Table.Cell class="text-right tabular-nums">
        {ticket.messageCount}
      </Table.Cell>
      <Table.Cell class="text-sm text-muted-foreground">
        {formatDateTimeFr(ticket.lastMessageAt)}
      </Table.Cell>
    {/snippet}

    {#snippet empty()}
      <EmptyState
        icon={Inbox}
        title="Aucun ticket"
        description={searchQuery || statusFilter !== 'all'
          ? 'Aucun ticket ne correspond à ce filtre.'
          : 'Aucun ticket remonté pour le moment.'}
      />
    {/snippet}
  </SortableTable>
</div>
