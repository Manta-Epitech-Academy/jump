<script lang="ts">
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import { deserialize } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import { Input } from '$lib/components/ui/input';
  import Search from '@lucide/svelte/icons/search';
  import Database from '@lucide/svelte/icons/database';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import {
    SF_STATUS_CLASS_LABELS,
    type SfStatusClass,
  } from '$lib/domain/sfMemberStatus';

  type ParticipationRow = {
    id: string;
    talentId: string;
    nom: string;
    prenom: string;
    email: string | null;
    phone: string | null;
    schoolName: string | null;
    sfMemberStatus: string | null;
    statusClass: SfStatusClass;
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
    totalUnrecognised: number;
    participations: ParticipationRow[];
  };

  let {
    open = $bindable(false),
    eventId,
    eventTitle,
    onStatusAdded,
  }: {
    open: boolean;
    eventId: string | null;
    eventTitle?: string;
    /** Told when a word joins the catalogue, so the host can offer it. */
    onStatusAdded?: (status: string) => void;
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
    const tokens = searchTokens(search);
    return data.participations.filter((row) => {
      if (filterVisibility === 'visible' && !row.isVisibleInDevSpace)
        return false;
      if (filterVisibility === 'hidden' && row.isVisibleInDevSpace)
        return false;
      return matchesAllTokens(
        buildHaystack([row.prenom, row.nom, row.email]),
        tokens,
      );
    });
  });

  // The words Jump does not know, once each, most carried first: each is one
  // decision (add it to the catalogue or not), whatever the number of rows.
  const unknownWords = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const row of data?.participations ?? []) {
      if (row.statusClass !== 'unrecognised' || !row.sfMemberStatus) continue;
      counts.set(row.sfMemberStatus, (counts.get(row.sfMemberStatus) ?? 0) + 1);
    }
    return [...counts]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  });

  let addingStatus = $state<string | null>(null);

  // Posted via fetch rather than an enhanced <form>: this dialog also opens from
  // inside the config wizard's form, and a nested form is invalid HTML. The host
  // is told rather than the page invalidated, which would reset that form.
  async function addToCatalogue(status: string) {
    if (addingStatus) return;
    addingStatus = status;
    try {
      const body = new FormData();
      body.set('status', status);
      const res = await fetch('/staff/admin/events?/addMemberStatus', {
        method: 'POST',
        body,
      });
      const result = deserialize(await res.text());
      if (result.type === 'success') {
        // The box that said so is gone once the last unknown word is added,
        // so the next step travels with the confirmation.
        toast.success(
          `${status} ajouté, et toujours masqué : cochez-le dans la configuration des événements qui doivent l'afficher.`,
        );
        onStatusAdded?.(status);
        await loadData();
      } else {
        toast.error(
          (result.type === 'failure'
            ? (result.data?.memberStatusError as string | undefined)
            : undefined) ?? "Erreur lors de l'ajout du statut.",
        );
      }
    } catch {
      toast.error("Erreur lors de l'ajout du statut.");
    } finally {
      addingStatus = null;
    }
  }

  // Styled by what the dev space does with the word on THIS event, never by the
  // word itself: which words are shown is set per event, so a colour per word
  // would paint CONNECTED as masked on the Coding Club that shows it.
  const STATUS_CLASS_BADGE: Record<SfStatusClass, string> = {
    shown: 'bg-success/10 text-success border-success/25',
    hidden: 'bg-secondary text-secondary-foreground',
    // A word Jump does not know gets a tone of its own: a neutral badge here is
    // how `MET` read as one more status for a month.
    unrecognised: 'border-dashed bg-warning/10 text-warning border-warning/40',
    missing: 'bg-muted text-muted-foreground',
  };

  function statusBadge(row: ParticipationRow) {
    return {
      class: STATUS_CLASS_BADGE[row.statusClass],
      label:
        row.statusClass === 'missing'
          ? 'Non renseigné'
          : (row.sfMemberStatus ?? ''),
    };
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
            {#if data.totalUnrecognised > 0}
              <span class="font-bold text-warning">
                dont {data.totalUnrecognised} au statut inconnu de Jump
              </span>
            {/if}
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
        {#if unknownWords.length > 0}
          <div
            class="space-y-2 border-b border-warning/30 bg-warning/5 px-4 py-3 sm:px-6"
          >
            {#each unknownWords as word (word.status)}
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  class="text-xs {STATUS_CLASS_BADGE.unrecognised}"
                >
                  {word.status}
                </Badge>
                <span class="text-muted-foreground">
                  {word.count} inscription{word.count > 1 ? 's' : ''} au statut inconnu
                  de Jump
                </span>
                <InfoTooltip
                  label="Ce que change l'ajout au catalogue"
                  text="Salesforce a peut-être ajouté ou renommé un statut. L'ajouter au catalogue le fait connaître de Jump : il n'est plus signalé comme inconnu."
                />
                <Button
                  size="sm"
                  variant="outline"
                  class="ml-auto h-7 cursor-pointer text-xs"
                  disabled={addingStatus !== null}
                  onclick={() => addToCatalogue(word.status)}
                >
                  {#if addingStatus === word.status}
                    <LoaderCircle class="h-3 w-3 animate-spin" />
                  {/if}
                  Ajouter au catalogue
                </Button>
              </div>
            {/each}
            <p class="text-xs text-muted-foreground">
              Ajouté, il reste masqué : cochez-le dans la configuration des
              événements qui doivent l'afficher.
            </p>
          </div>
        {/if}

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
          <div class="flex gap-1 text-xs font-bold">
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
                <Table.Head>Participant</Table.Head>
                <Table.Head>Email</Table.Head>
                <Table.Head>Statut SF</Table.Head>
                <Table.Head class="w-24 text-right">Espace dev</Table.Head>
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
                  {@const sb = statusBadge(row)}
                  <Table.Row>
                    <Table.Cell class="text-xs font-medium">
                      {row.prenom}
                      {row.nom}
                      {#if row.schoolName}
                        <span
                          class="block text-xs font-normal text-muted-foreground"
                        >
                          {row.schoolName}
                        </span>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="font-mono text-xs text-muted-foreground">
                      {row.email ?? '-'}
                    </Table.Cell>
                    <Table.Cell>
                      <span class="inline-flex items-center gap-1.5">
                        <Badge variant="outline" class="text-xs {sb.class}">
                          {sb.label}
                        </Badge>
                        {#if row.statusClass === 'unrecognised'}
                          <InfoTooltip
                            label="Statut inconnu de Jump"
                            text="Statut Salesforce que Jump ne connaît pas encore : l'inscription est masquée de l'espace dev par prudence. Il s'ajoute au catalogue depuis l'encadré en haut de cette fenêtre."
                          />
                        {/if}
                      </span>
                    </Table.Cell>
                    <Table.Cell class="text-right">
                      {#if row.isVisibleInDevSpace}
                        <span
                          class="inline-flex items-center gap-1 text-xs font-bold text-success"
                        >
                          <Eye class="h-3 w-3" />
                          Visible
                        </span>
                      {:else}
                        <Tooltip.Provider delayDuration={150}>
                          <Tooltip.Root>
                            <Tooltip.Trigger>
                              {#snippet child({ props })}
                                <span
                                  {...props}
                                  class="inline-flex cursor-help items-center gap-1 text-xs font-bold text-muted-foreground"
                                >
                                  <EyeOff class="h-3 w-3" />
                                  Masqué
                                </span>
                              {/snippet}
                            </Tooltip.Trigger>
                            <Tooltip.Content
                              class="max-w-xs text-xs first-letter:uppercase"
                            >
                              {SF_STATUS_CLASS_LABELS[row.statusClass]},
                              toujours enregistrée dans Jump.
                            </Tooltip.Content>
                          </Tooltip.Root>
                        </Tooltip.Provider>
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
