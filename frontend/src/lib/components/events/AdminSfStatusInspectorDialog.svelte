<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import { Input } from '$lib/components/ui/input';
  import Search from '@lucide/svelte/icons/search';
  import Database from '@lucide/svelte/icons/database';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  type ParticipationRow = {
    id: string;
    talentId: string;
    nom: string;
    prenom: string;
    email: string | null;
    phone: string | null;
    schoolName: string | null;
    sfMemberStatus: string | null;
    isVisibleInDevSpace: boolean;
    updatedAt: string;
  };

  type InspectorData = {
    event: {
      id: string;
      displayName: string;
      externalId: string | null;
    };
    total: number;
    totalVisible: number;
    totalHidden: number;
    statusCounts: Record<string, number>;
    participations: ParticipationRow[];
  };

  let {
    open = $bindable(false),
    eventId,
    eventTitle,
  }: {
    open: boolean;
    eventId: string | null;
    eventTitle?: string;
  } = $props();

  let loading = $state(false);
  let errorMsg = $state<string | null>(null);
  let data = $state<InspectorData | null>(null);
  let search = $state('');
  let filterVisibility = $state<'all' | 'visible' | 'hidden'>('all');

  async function loadData() {
    if (!eventId) return;
    loading = true;
    errorMsg = null;
    try {
      const res = await fetch(`/api/admin/events/${eventId}/participations`);
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Erreur de chargement';
    } finally {
      loading = false;
    }
  }

  let loadedFor = $state<string | null>(null);

  $effect(() => {
    if (open && eventId && eventId !== loadedFor) {
      loadData();
      loadedFor = eventId;
    } else if (!open && loadedFor !== null) {
      loadedFor = null;
      search = '';
      filterVisibility = 'all';
    }
  });

  const filteredRows = $derived.by(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.participations.filter((row) => {
      if (filterVisibility === 'visible' && !row.isVisibleInDevSpace)
        return false;
      if (filterVisibility === 'hidden' && row.isVisibleInDevSpace)
        return false;
      if (!q) return true;
      const fullName = `${row.prenom} ${row.nom}`.toLowerCase();
      const email = (row.email ?? '').toLowerCase();
      return fullName.includes(q) || email.includes(q);
    });
  });

  const STATUS_BADGE: Record<string, { class: string; label: string }> = {
    READY: {
      class:
        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
      label: 'Ready',
    },
    MEET: {
      class: 'bg-epi-tech/10 text-epi-tech-ink border-epi-tech/25',
      label: 'Meet',
    },
    CONNECTED: {
      class:
        'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
      label: 'Connected',
    },
    DESISTED: {
      class:
        'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25',
      label: 'Desisted',
    },
  };

  function statusBadge(status: string | null) {
    if (!status)
      return {
        class: 'bg-muted text-muted-foreground',
        label: 'Non renseigné',
      };
    return (
      STATUS_BADGE[status.toUpperCase()] ?? {
        class: 'bg-secondary text-secondary-foreground',
        label: status,
      }
    );
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-3xl">
    <Dialog.Header class="border-b px-4 py-4 text-start sm:px-6">
      <Dialog.Title class="flex items-center gap-2">
        <Database class="h-5 w-5 text-epi-tomorrow" />
        Membres Salesforce
      </Dialog.Title>
      <Dialog.Description>
        {eventTitle || data?.event.displayName || 'Événement'}
        {#if data}
          <span class="ml-1 font-bold text-foreground">
            {data.totalVisible} visible{data.totalVisible > 1 ? 's' : ''}
          </span>
          sur {data.total} synchronisé{data.total > 1 ? 's' : ''}
          {#if data.totalHidden > 0}
            · {data.totalHidden} masqué{data.totalHidden > 1 ? 's' : ''}
          {/if}
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {#if loading && !data}
        <div
          class="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
        >
          <LoaderCircle class="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      {:else if errorMsg}
        <div
          class="m-4 flex items-center gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:m-6"
        >
          <TriangleAlert class="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      {:else if data}
        <!-- Toolbar -->
        <div
          class="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6"
        >
          <div class="relative min-w-0 flex-1">
            <Search
              class="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Rechercher…"
              bind:value={search}
              class="h-9 pl-9 text-xs"
            />
          </div>
          <div class="flex gap-1 text-[11px] font-bold">
            <button
              type="button"
              onclick={() => (filterVisibility = 'all')}
              class="rounded-sm px-2.5 py-1 transition-colors {filterVisibility ===
              'all'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
            >
              Tous
            </button>
            <button
              type="button"
              onclick={() => (filterVisibility = 'visible')}
              class="rounded-sm px-2.5 py-1 transition-colors {filterVisibility ===
              'visible'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
            >
              <Eye class="mr-1 inline h-3 w-3" />
              Visibles
            </button>
            <button
              type="button"
              onclick={() => (filterVisibility = 'hidden')}
              class="rounded-sm px-2.5 py-1 transition-colors {filterVisibility ===
              'hidden'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
            >
              <EyeOff class="mr-1 inline h-3 w-3" />
              Masqués
            </button>
          </div>
        </div>

        <!-- Table -->
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Table.Root>
            <Table.Header class="sticky top-0 bg-background">
              <Table.Row>
                <Table.Head class="text-xs">Participant</Table.Head>
                <Table.Head class="text-xs">Email</Table.Head>
                <Table.Head class="text-xs">Statut SF</Table.Head>
                <Table.Head class="w-24 text-right text-xs"
                  >Espace dev</Table.Head
                >
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if filteredRows.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={4}
                    class="h-20 text-center text-xs text-muted-foreground"
                  >
                    Aucun membre pour ces critères.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each filteredRows as row (row.id)}
                  {@const sb = statusBadge(row.sfMemberStatus)}
                  <Table.Row>
                    <Table.Cell class="text-xs font-medium">
                      {row.prenom}
                      {row.nom}
                      {#if row.schoolName}
                        <span
                          class="block text-[11px] font-normal text-muted-foreground"
                        >
                          {row.schoolName}
                        </span>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="font-mono text-xs text-muted-foreground">
                      {row.email ?? '—'}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant="outline" class="text-[10px] {sb.class}">
                        {sb.label}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell class="text-right">
                      {#if row.isVisibleInDevSpace}
                        <span
                          class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                        >
                          <Eye class="h-3 w-3" />
                          Visible
                        </span>
                      {:else}
                        <span
                          class="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground"
                          title="Masqué de l'espace dev (statut ni READY ni MEET)"
                        >
                          <EyeOff class="h-3 w-3" />
                          Masqué
                        </span>
                      {/if}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
