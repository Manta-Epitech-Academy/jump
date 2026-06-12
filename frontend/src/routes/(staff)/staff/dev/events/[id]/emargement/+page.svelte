<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { page } from '$app/state';
  import { invalidate } from '$app/navigation';
  import { enhance as formEnhance, deserialize } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import QrCode from '@lucide/svelte/icons/qr-code';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import Phone from '@lucide/svelte/icons/phone';
  import Users from '@lucide/svelte/icons/users';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import Download from '@lucide/svelte/icons/download';
  import * as Table from '$lib/components/ui/table';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { can } from '$lib/domain/permissions';
  import {
    slotLabelFr,
    statusLabelFr,
    defaultActiveSlotKey,
    indexPresences,
    cellOf,
    effectiveStatus,
    computeSlotStats,
    type CellStatus,
    type PresenceCell as PresenceCellData,
  } from '$lib/domain/eventPresence';
  import type { PageData } from './$types';
  import type { PresenceRow, PresenceSortKey } from './components/types';
  import PresenceSwitch from './components/PresenceSwitch.svelte';
  import ContactDialog from './components/ContactDialog.svelte';
  import SlotStatsCard from './components/SlotStatsCard.svelte';
  import PresenceHelpCard from './components/PresenceHelpCard.svelte';
  import SlotNavigator from './components/SlotNavigator.svelte';
  import QrDialog from './components/QrDialog.svelte';

  let { data }: { data: PageData } = $props();

  const canEdit = $derived(can('devMember', page.data.staffProfile?.staffRole));

  // ── Active créneau ─────────────────────────────────────────────────────
  let activeSlotKey = $state<string>(
    untrack(() => defaultActiveSlotKey(data.slots, data.todayKey, 9)),
  );

  const activeSlot = $derived(
    data.slots.find((s) => s.key === activeSlotKey) ?? data.slots[0] ?? null,
  );
  const presenceIndex = $derived(indexPresences(data.presences));
  // Closed = manual early-close OR cutoff passed; resolved server-side.
  const closedSet = $derived(new Set(data.closedKeys));
  const pastCutoffSet = $derived(new Set(data.pastCutoffKeys));
  const isActiveClosed = $derived(
    activeSlot ? closedSet.has(`${activeSlot.day}|${activeSlot.slot}`) : false,
  );
  // Past its cutoff = closed by the clock: it can't be reopened (the day moved
  // on); a late arrival is handled by marking that one cell by hand.
  const isActivePastCutoff = $derived(
    activeSlot
      ? pastCutoffSet.has(`${activeSlot.day}|${activeSlot.slot}`)
      : false,
  );

  function cell(row: PresenceRow): PresenceCellData {
    if (!activeSlot) return cellOf(presenceIndex, row.talentId, '', 'morning');
    const c = cellOf(
      presenceIndex,
      row.talentId,
      activeSlot.day,
      activeSlot.slot,
    );
    // Unmarked talent in a closed créneau reads as absent (projection, not a row).
    const status = effectiveStatus(c.status, isActiveClosed);
    return status === c.status ? c : { status, source: c.source };
  }

  // Optimistic per-cell overrides: a click on the switch paints the new status
  // at once, then the POST + reload reconciles. Keyed by (talent, day, slot).
  const overrides = new SvelteMap<string, CellStatus>();
  const cellKey = (talentId: string, day: string, slot: string) =>
    `${talentId}|${day}|${slot}`;

  // Status to render for a row's active-slot cell: the in-flight override if any,
  // otherwise the server-projected status from cell().
  function rowStatus(row: PresenceRow): CellStatus {
    if (!activeSlot) return cell(row).status;
    return (
      overrides.get(cellKey(row.talentId, activeSlot.day, activeSlot.slot)) ??
      cell(row).status
    );
  }

  // ── Filters (status + search only) ──────────────────────────────────────
  let searchQuery = $state('');
  let statusFilter = $state<'all' | CellStatus>('all');
  let sortKey = $state<PresenceSortKey>('nom');
  let sortDir = $state<SortDir>('asc');

  const statusOptions: { value: 'all' | CellStatus; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'pending', label: statusLabelFr('pending') },
    { value: 'present', label: statusLabelFr('present') },
    { value: 'late', label: statusLabelFr('late') },
    { value: 'absent', label: statusLabelFr('absent') },
    { value: 'excused', label: statusLabelFr('excused') },
  ];
  const statusFilterLabel = $derived(
    statusOptions.find((o) => o.value === statusFilter)?.label ?? 'Tous',
  );

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function haystack(r: PresenceRow): string {
    return norm(
      [
        r.nom,
        r.prenom,
        r.phone,
        r.email,
        ...r.guardians.flatMap((g) => [g.name, g.phone, g.email]),
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  function compareRows(a: PresenceRow, b: PresenceRow): number {
    return sortKey === 'prenom'
      ? a.prenom.localeCompare(b.prenom, 'fr')
      : a.nom.localeCompare(b.nom, 'fr');
  }

  const filtered = $derived.by(() => {
    const tokens = norm(searchQuery).split(/\s+/).filter(Boolean);
    const out = data.rows.filter((r) => {
      if (statusFilter !== 'all' && rowStatus(r) !== statusFilter) return false;
      if (tokens.length === 0) return true;
      const h = haystack(r);
      return tokens.every((t) => h.includes(t));
    });
    out.sort((a, b) => {
      const c = compareRows(a, b);
      return sortDir === 'asc' ? c : -c;
    });
    return out;
  });

  const anyFilter = $derived(
    searchQuery.trim().length > 0 || statusFilter !== 'all',
  );
  const countSuffix = $derived(
    anyFilter ? 'correspondent aux filtres' : 'au total',
  );

  function toggleSort(key: string) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = key as PresenceSortKey;
      sortDir = 'asc';
    }
  }
  function resetFilters() {
    searchQuery = '';
    statusFilter = 'all';
  }

  // The name column flexes (w-full) to soak up the slack, so the status +
  // contact columns pin to the right edge, like the Lycée column on the Inscrits
  // page, rather than a trailing empty spacer column.
  const columns = $derived<ColumnDef[]>([
    { key: 'avatar', label: '', class: 'w-10' },
    { key: 'prenom', label: 'Prénom', sortable: true, class: 'w-36' },
    { key: 'nom', label: 'Nom', sortable: true, class: 'w-full' },
    {
      key: 'status',
      label: activeSlot ? slotLabelFr(activeSlot.slot) : 'Présence',
      class: 'w-80',
    },
    { key: 'contact', label: 'Contact', align: 'right', class: 'w-20' },
  ]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const activeStats = $derived(
    computeSlotStats(data.rows.map((r) => rowStatus(r))),
  );

  // ── Mutations ──────────────────────────────────────────────────────────
  let qrOpen = $state(false);
  let presentConfirmOpen = $state(false);
  let closeConfirmOpen = $state(false);
  let contactOpen = $state(false);
  let contactTarget = $state<PresenceRow | null>(null);

  const anyDialogOpen = $derived(
    qrOpen || presentConfirmOpen || closeConfirmOpen || contactOpen,
  );

  function openContact(row: PresenceRow) {
    contactTarget = row;
    contactOpen = true;
  }

  // Mark one cell straight from the inline switch. Optimistic: paint the choice
  // at once, POST it to the `setPresence` action, then reload to reconcile.
  // `pending` clears the cell (the action deletes the row).
  async function setStatus(row: PresenceRow, status: CellStatus) {
    if (!canEdit || !activeSlot) return;
    const { day, slot } = activeSlot;
    const key = cellKey(row.talentId, day, slot);
    overrides.set(key, status);

    const body = new FormData();
    body.set('talentId', row.talentId);
    body.set('day', day);
    body.set('slot', slot);
    body.set('status', status);
    try {
      const res = await fetch('?/setPresence', { method: 'POST', body });
      const result = deserialize(await res.text());
      if (result.type !== 'success') throw new Error('rejected');
      await invalidate('staff:event-presence');
      // The reload now carries the write; drop the override unless a newer click
      // on the same cell has already replaced it.
      if (overrides.get(key) === status) overrides.delete(key);
    } catch {
      if (overrides.get(key) === status) overrides.delete(key);
      toast.error("Échec de l'enregistrement. Réessaie.");
    }
  }

  const exportHref = $derived(`${page.url.pathname}/export`);

  // Refine the active créneau to the real wall-clock half-day once mounted (SSR
  // has no local hour), then poll so QR self-check-ins surface within seconds.
  // Polling pauses while a dialog is open so a mid-edit form isn't resynced.
  onMount(() => {
    activeSlotKey = defaultActiveSlotKey(
      data.slots,
      data.todayKey,
      new Date().getHours(),
    );
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && !anyDialogOpen) {
        invalidate('staff:event-presence');
      }
    }, 5000);
    return () => clearInterval(id);
  });
</script>

<svelte:head>
  <title>Émargement — {data.event.titre}</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <!-- One tooltip context for the whole page: the header's slot actions and the
       per-row contact icons both surface tooltips from here. -->
  <Tooltip.Provider delayDuration={150}>
    <PageHeader title="Émargement">
      <!-- Header actions act on the whole stage or the display: the full-record
           export (read) and the QR (display). The active slot's open/close
           control lives in the SYNTHÈSE card instead, beside the Clôturé badge it
           toggles. Filter-scoped controls (search, statut) stay in the toolbar. -->
      <!-- Full-record export: every talent x every créneau, NOT the on-screen
           filter (unlike the Inscrits toolbar export). Kept here, away from the
           toolbar, so it is never mistaken for a filtered export. -->
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="sm"
              href={exportHref}
              class="rounded-sm"
            >
              <Download class="mr-1.5 h-4 w-4" />
              Tout exporter (XLSX)
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          Toutes les présences du stage (tous les créneaux)
        </Tooltip.Content>
      </Tooltip.Root>

      {#if canEdit}
        <!-- A closed créneau (manual close OR past the 11h/15h cutoff) makes the
             QR inert: a scan lands the talent on the "créneau clôturé" screen and
             records nothing. Disable rather than project a dead code; the tooltip
             says why and, when reopenable, points at the SYNTHÈSE reopen control.
             A span wraps the button so the tooltip still fires while it's
             disabled (a disabled button takes no pointer events). -->
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <span {...props} class="inline-flex">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => (qrOpen = true)}
                  disabled={!activeSlot || isActiveClosed}
                  class="rounded-sm"
                >
                  <QrCode class="mr-1.5 h-4 w-4" />
                  Afficher le QR code
                </Button>
              </span>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content class="max-w-56">
            {#if !isActiveClosed}
              Projetez le QR code : les stagiaires le scannent pour pointer
              eux-mêmes.
            {:else if isActivePastCutoff}
              Ce créneau est terminé : les stagiaires ne peuvent plus pointer
              avec le QR code.
            {:else}
              Ce créneau est clôturé : les stagiaires ne peuvent plus pointer.
              Rouvrez-le pour réactiver le QR code.
            {/if}
          </Tooltip.Content>
        </Tooltip.Root>
      {/if}
    </PageHeader>

    {#if data.rows.length === 0}
      <div
        class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
      >
        <Users class="h-10 w-10 text-muted-foreground opacity-30" />
        <h3
          class="mt-4 text-sm font-bold tracking-widest text-foreground uppercase"
        >
          Aucun stagiaire inscrit
        </h3>
        <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
          Les stagiaires apparaîtront ici une fois la synchronisation effectuée.
        </p>
      </div>
    {:else}
      <div class="grid gap-6 xl:grid-cols-10">
        <div class="min-w-0 space-y-4 xl:col-span-7">
          <DataTableToolbar
            searchValue={searchQuery}
            onSearchInput={(v) => (searchQuery = v)}
            searchPlaceholder="Rechercher un stagiaire…"
            searchWidthClass="max-w-[230px]"
            filtersAlign="end"
            count={filtered.length}
            countNoun="stagiaire"
            {countSuffix}
          >
            {#snippet filters()}
              <SlotNavigator slots={data.slots} bind:value={activeSlotKey} />
              <div class="flex items-center gap-2">
                <span
                  class="hidden text-[10px] font-bold tracking-widest text-muted-foreground uppercase sm:inline"
                >
                  Statut
                </span>
                <Select.Root
                  type="single"
                  value={statusFilter}
                  onValueChange={(v) =>
                    (statusFilter = (v ?? 'all') as typeof statusFilter)}
                >
                  <Select.Trigger
                    class="h-8 w-44 cursor-pointer rounded-sm"
                    aria-label="Filtrer par statut de présence"
                  >
                    <span class="truncate">{statusFilterLabel}</span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each statusOptions as o (o.value)}
                      <Select.Item value={o.value}>{o.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            {/snippet}

            {#snippet countActions()}
              {#if anyFilter}
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={resetFilters}
                  class="h-7 rounded-sm px-2 text-muted-foreground hover:text-foreground"
                >
                  <FilterX class="mr-1.5 h-4 w-4" />
                  Réinitialiser
                </Button>
              {/if}
            {/snippet}
          </DataTableToolbar>

          <SortableTable
            {columns}
            rows={filtered}
            {sortKey}
            {sortDir}
            onSort={toggleSort}
            rowKey={(r) => r.talentId}
            stickyHeader
            layout="fixed"
          >
            {#snippet row(r: PresenceRow)}
              <Table.Cell>
                <TalentAvatar
                  talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
                  size="sm"
                />
              </Table.Cell>
              <Table.Cell class="font-medium">
                <span class="block truncate" title={r.prenom}>{r.prenom}</span>
              </Table.Cell>
              <Table.Cell class="font-bold uppercase">
                <span class="block truncate" title={r.nom}>{r.nom}</span>
              </Table.Cell>
              <Table.Cell>
                <PresenceSwitch
                  status={rowStatus(r)}
                  disabled={!canEdit}
                  onset={(s) => setStatus(r, s)}
                />
              </Table.Cell>
              <!-- Icon-only to cut the per-row noise of 200+ rows: quiet at rest,
                 brightening when the row is hovered or focused. Kept visible
                 (not display:none) so it stays tappable on a touch device where
                 there is no hover, which is how émargement is run on the floor. -->
              <Table.Cell class="text-right">
                {#if r.phone || r.email || r.guardians.length}
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 rounded-sm text-muted-foreground/40 transition-colors group-focus-within/row:text-muted-foreground group-hover/row:text-muted-foreground hover:bg-epi-blue/10 hover:text-epi-blue"
                          onclick={() => openContact(r)}
                          aria-label={`Coordonnées de ${r.prenom} ${r.nom}`}
                        >
                          <Phone class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content>Coordonnées</Tooltip.Content>
                  </Tooltip.Root>
                {:else}
                  <span class="text-sm text-muted-foreground/40">—</span>
                {/if}
              </Table.Cell>
            {/snippet}

            <!-- Mobile card (below lg): name + contact on top, then the présence
                 switch full-width beneath as the row's primary control. No `rowHref`
                 on this table, so the switch and contact button stay directly
                 tappable (no stretched-link overlay), which is how émargement is run
                 on the floor from a phone. -->
            {#snippet mobileRow(r: PresenceRow)}
              <div class="space-y-2.5">
                <div class="flex items-center gap-3">
                  <TalentAvatar
                    talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
                    size="sm"
                  />
                  <p class="min-w-0 flex-1 truncate text-sm">
                    <span class="font-medium">{r.prenom}</span>
                    <span class="font-bold uppercase">{r.nom}</span>
                  </p>
                  {#if r.phone || r.email || r.guardians.length}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 shrink-0 rounded-sm text-muted-foreground hover:bg-epi-blue/10 hover:text-epi-blue"
                      onclick={() => openContact(r)}
                      aria-label={`Coordonnées de ${r.prenom} ${r.nom}`}
                    >
                      <Phone class="h-4 w-4" />
                    </Button>
                  {/if}
                </div>
                <PresenceSwitch
                  block
                  status={rowStatus(r)}
                  disabled={!canEdit}
                  onset={(s) => setStatus(r, s)}
                />
              </div>
            {/snippet}

            {#snippet empty()}
              <div class="flex flex-col items-center gap-3 py-6">
                <span
                  class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
                >
                  Aucun résultat
                </span>
                {#if anyFilter}
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={resetFilters}
                    class="rounded-sm"
                  >
                    Réinitialiser les filtres
                  </Button>
                {/if}
              </div>
            {/snippet}
          </SortableTable>
        </div>

        <aside class="min-w-0 xl:col-span-3">
          {#if activeSlot}
            <!-- The active slot's open/close control, rendered into the SYNTHÈSE
                 card footer so it sits with the Clôturé badge it toggles. Edit-only
                 (passed as the card `footer` when canEdit); read-only staff still
                 see the badge, just no control. -->
            {#snippet slotLifecycle()}
              {#if activeSlot}
                {#if isActivePastCutoff}
                  <!-- Auto-closed by the clock (past 11h / 15h): not reopenable,
                       the day moved on. A late arrival is handled by marking the
                       talent's cell directly on their line. -->
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <span
                          {...props}
                          class="inline-flex w-full cursor-default items-center justify-center gap-1.5 rounded-sm border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground"
                        >
                          <Lock class="h-4 w-4" />
                          Clôturé automatiquement
                        </span>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content class="max-w-56">
                      Clôture automatique passé {slotLabelFr(
                        activeSlot.slot,
                      ) === 'Matin'
                        ? '11h'
                        : '15h'}. Pour un retardataire, modifiez directement sa
                      présence sur sa ligne.
                    </Tooltip.Content>
                  </Tooltip.Root>
                {:else if isActiveClosed}
                  <form
                    method="POST"
                    action="?/reopenSlot"
                    use:formEnhance={() =>
                      async ({ result, update }) => {
                        await update();
                        if (result.type === 'success')
                          toast.success('Créneau rouvert.');
                      }}
                  >
                    <input type="hidden" name="day" value={activeSlot.day} />
                    <input type="hidden" name="slot" value={activeSlot.slot} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      class="w-full rounded-sm"
                    >
                      <LockOpen class="mr-1.5 h-4 w-4" />
                      Rouvrir le créneau
                    </Button>
                  </form>
                {:else}
                  <!-- The two end-of-créneau bulk actions, paired so they read as
                       a choice: mark everyone present, or clôturer (which marks the
                       still-en-attente stagiaires absent and cuts the QR). The
                       caption spells out the clôture effect, the part staff missed. -->
                  <div class="space-y-2">
                    <div class="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        class="w-full rounded-sm"
                        onclick={() => (presentConfirmOpen = true)}
                      >
                        <CheckCheck class="mr-1.5 h-4 w-4" />
                        Tout présent
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        class="w-full rounded-sm"
                        onclick={() => (closeConfirmOpen = true)}
                      >
                        <Lock class="mr-1.5 h-4 w-4" />
                        Clôturer
                      </Button>
                    </div>
                    <p class="text-[11px] leading-snug text-muted-foreground">
                      En fin de créneau : marquez tout le monde présent, ou
                      clôturez pour noter absents ceux qui restent « en attente
                      ».
                    </p>
                  </div>
                {/if}
              {/if}
            {/snippet}

            <!-- Same rail pattern as Inscrits: side by side below xl (the aside is
               full width there), folding to a sticky single column at xl. -->
            <div
              class="grid items-start gap-4 sm:grid-cols-2 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-6rem)] xl:grid-cols-1 xl:overflow-y-auto xl:pr-1"
            >
              <SlotStatsCard
                slotLabel={slotLabelFr(activeSlot.slot)}
                stats={activeStats}
                closed={isActiveClosed}
                stageRate={data.attendanceRate}
                footer={canEdit ? slotLifecycle : undefined}
              />
              <PresenceHelpCard />
            </div>
          {/if}
        </aside>
      </div>
    {/if}
  </Tooltip.Provider>
</div>

<!-- QR dialog -->
{#if activeSlot}
  <QrDialog
    bind:open={qrOpen}
    basePath={page.url.pathname}
    day={activeSlot.day}
    slot={activeSlot.slot}
  />
{/if}

<!-- Contact card: phones to reach the stagiaire, then the family if no answer -->
<ContactDialog bind:open={contactOpen} row={contactTarget} />

<!-- Mark-all-present confirmation -->
<Dialog.Root bind:open={presentConfirmOpen}>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Marquer tout le monde présent ?</Dialog.Title>
      <Dialog.Description>
        Tous les stagiaires encore « En attente » sur ce créneau passeront
        présents. Les présences déjà saisies (absent, justifié, en retard) ne
        sont pas modifiées.
      </Dialog.Description>
    </Dialog.Header>
    {#if activeSlot}
      <form
        method="POST"
        action="?/markAllPresent"
        use:formEnhance={() =>
          async ({ result, update }) => {
            await update();
            if (result.type === 'success')
              toast.success('Stagiaires en attente marqués présents.');
            // The créneau closed between render and submit (e.g. the 11h/15h
            // cutoff passed): the server refuses the bulk mark, surface why.
            else if (result.type === 'failure')
              toast.error(
                (result.data?.form as { message?: string } | undefined)
                  ?.message ??
                  'Ce créneau est clôturé : corrigez les présences ligne par ligne.',
              );
            presentConfirmOpen = false;
          }}
        class="flex justify-end gap-2 pt-2"
      >
        <input type="hidden" name="day" value={activeSlot.day} />
        <input type="hidden" name="slot" value={activeSlot.slot} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onclick={() => (presentConfirmOpen = false)}
        >
          Annuler
        </Button>
        <Button type="submit" size="sm">Tout marquer présent</Button>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<!-- Close-slot confirmation -->
<Dialog.Root bind:open={closeConfirmOpen}>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Clôturer et noter les absents ?</Dialog.Title>
      <Dialog.Description>
        Tous les stagiaires encore « En attente » seront marqués absents et le
        QR code de ce créneau cessera de fonctionner. Vous pourrez rouvrir le
        créneau si besoin.
      </Dialog.Description>
    </Dialog.Header>
    {#if activeSlot}
      <form
        method="POST"
        action="?/closeSlot"
        use:formEnhance={() =>
          async ({ result, update }) => {
            await update();
            if (result.type === 'success') toast.success('Créneau clôturé.');
            closeConfirmOpen = false;
          }}
        class="flex justify-end gap-2 pt-2"
      >
        <input type="hidden" name="day" value={activeSlot.day} />
        <input type="hidden" name="slot" value={activeSlot.slot} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onclick={() => (closeConfirmOpen = false)}
        >
          Annuler
        </Button>
        <Button type="submit" variant="destructive" size="sm">Clôturer</Button>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
