<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { resolve } from '$app/paths';
  import { invalidate } from '$app/navigation';
  import { enhance as formEnhance, deserialize } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import Phone from '@lucide/svelte/icons/phone';
  import NotebookPen from '@lucide/svelte/icons/notebook-pen';
  import Users from '@lucide/svelte/icons/users';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import * as Table from '$lib/components/ui/table';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import {
    slotLabelFr,
    statusLabelFr,
    indexPresences,
    cellOf,
    effectiveStatus,
    computeSlotStats,
    type CellStatus,
    type PresenceCell as PresenceCellData,
    type EventSlot,
  } from '$lib/domain/eventPresence';
  import type { PresenceRow, PresenceSortKey, EmargementCohort } from './types';
  import PresenceSwitch from './PresenceSwitch.svelte';
  import ContactDialog from './ContactDialog.svelte';
  import NotesDialog from './NotesDialog.svelte';
  import SlotStatsCard from './SlotStatsCard.svelte';
  import PresenceHelpCard from './PresenceHelpCard.svelte';
  import SlotNavigator from './SlotNavigator.svelte';

  // The streamed roster plus the slot context the shell owns. `activeSlotKey` is
  // bound back to the shell so its header QR button stays in sync with the slot
  // picked here; `dialogOpen` is reported up so the shell can pause polling while
  // an edit dialog is open. This component owns all filter/sort/optimistic state,
  // so it stays mounted across the 5s reload (the shell swaps `rows`/`presences`
  // in place) and never loses an in-flight edit or the current search.
  let {
    rows,
    presences,
    attendanceRate,
    slots,
    activeSlot,
    isActiveClosed,
    isActivePastCutoff,
    canEdit,
    eventId,
    timezone,
    activeSlotKey = $bindable(),
    dialogOpen = $bindable(false),
  }: EmargementCohort & {
    slots: EventSlot[];
    activeSlot: EventSlot | null;
    isActiveClosed: boolean;
    isActivePastCutoff: boolean;
    canEdit: boolean;
    /** Anchors notes created from this screen to the event (see NotesDialog). */
    eventId: string;
    /** Campus IANA timezone, forwarded to the notes dialog for byline times. */
    timezone: string;
    activeSlotKey: string;
    dialogOpen?: boolean;
  } = $props();

  const presenceIndex = $derived(indexPresences(presences));

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
    const out = rows.filter((r) => {
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
    { key: 'notes', label: 'Note', align: 'right', class: 'w-12' },
    { key: 'contact', label: 'Contact', align: 'right', class: 'w-20' },
  ]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const activeStats = $derived(computeSlotStats(rows.map((r) => rowStatus(r))));

  // ── Dialogs ──────────────────────────────────────────────────────────────
  let presentConfirmOpen = $state(false);
  let closeConfirmOpen = $state(false);
  let contactOpen = $state(false);
  let contactTarget = $state<PresenceRow | null>(null);
  let notesOpen = $state(false);
  let notesTarget = $state<PresenceRow | null>(null);

  // Report dialog-open state up so the shell can pause its 5s poll while an edit
  // is in progress (a resync mid-edit would clobber the form). The QR dialog is
  // shell-owned and ORed in there.
  $effect(() => {
    dialogOpen =
      presentConfirmOpen || closeConfirmOpen || contactOpen || notesOpen;
  });

  function openContact(row: PresenceRow) {
    contactTarget = row;
    contactOpen = true;
  }

  // Reactive note-count overrides (mirrors the presence `overrides` map): the
  // dialog reports the new count after a create/delete so the row icon tint
  // updates without a full page reload. The bodies live in the dialog, not here.
  const noteCounts = new SvelteMap<string, number>();
  function rowNoteCount(row: PresenceRow): number {
    return noteCounts.get(row.talentId) ?? row.noteCount;
  }

  function openNotes(row: PresenceRow) {
    notesTarget = row;
    notesOpen = true;
  }

  function onNoteCountChange(talentId: string, count: number) {
    noteCounts.set(talentId, count);
  }

  // True when this talent has a note taken during the créneau on screen (from each
  // note's stored anchor, projected to `noteSlotKeys` server-side): it lights the
  // trigger so staff spot who was noted this half-day. A note just added in the
  // dialog catches up on the next 5s poll (good enough; no optimistic timestamp).
  function rowNoteInActiveSlot(row: PresenceRow): boolean {
    return !!activeSlot && row.noteSlotKeys.includes(activeSlot.key);
  }

  // The trigger conveys state by its own colour, never a count badge (which read
  // as a notification): lit (tinted + ring) only when a note lands in the active
  // créneau, otherwise the quiet contact-icon resting tone. Notes from other
  // créneaux don't tint it; they surface in the hover tooltip and the dialog.
  // `mobile` keeps the resting icon legible where there is no row hover.
  function noteTriggerClass(row: PresenceRow, mobile = false): string {
    const base = 'h-8 w-8 shrink-0 rounded-sm transition-colors';
    if (rowNoteInActiveSlot(row)) {
      return cn(
        base,
        'bg-epi-blue/10 text-epi-blue ring-1 ring-inset ring-epi-blue/30 hover:bg-epi-blue/15',
      );
    }
    return cn(
      base,
      mobile
        ? 'text-muted-foreground hover:bg-epi-blue/10 hover:text-epi-blue'
        : 'text-muted-foreground/40 group-focus-within/row:text-muted-foreground group-hover/row:text-muted-foreground hover:bg-epi-blue/10 hover:text-epi-blue',
    );
  }

  // The talent fiche opens in a new tab on purpose: staff stay anchored in the
  // émargement flow (presence toggles, filters, scroll position) instead of
  // navigating away mid-attendance, while still reaching the full dossier when a
  // case needs it. Backs the row name/avatar links below. The `?event=` carries
  // the current event: the fiche loads in a fresh tab with no client-side
  // `lastEventId` to fall back on, so without it the dev sidebar would snap to
  // the workspace default instead of this event. Mirrors the entretiens link.
  function ficheHref(talentId: string): string {
    return resolve(`/staff/dev/students/${talentId}`) + `?event=${eventId}`;
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
</script>

<!-- One tooltip context for the roster: the per-row contact/notes icons and the
     slot-lifecycle controls all surface tooltips from here. -->
<Tooltip.Provider delayDuration={150}>
  {#if rows.length === 0}
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
          searchWidthClass="flex-1 min-w-0 max-w-[230px]"
          filtersAlign="end"
          count={filtered.length}
          countNoun="stagiaire"
          {countSuffix}
        >
          {#snippet filters()}
            <SlotNavigator {slots} bind:value={activeSlotKey} />
            <div class="flex items-center gap-2">
              <span
                class="hidden text-[10px] font-bold tracking-widest text-muted-foreground uppercase sm:inline"
              >
                Statut
              </span>
              <FilterSelect
                ariaLabel="Filtrer par statut de présence"
                options={statusOptions}
                value={statusFilter}
                onChange={(v) => (statusFilter = v as typeof statusFilter)}
                triggerClass="w-32"
              />
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
            <!-- The avatar is the only fiche link: a small, conventional
                 target that reuses an element already in the row, so it adds
                 no surface to mis-tap while marking presence. New tab keeps
                 staff anchored in the émargement flow. -->
            <Table.Cell>
              <a
                href={ficheHref(r.talentId)}
                target="_blank"
                rel="noopener"
                class="inline-flex align-middle"
                title="Voir la fiche"
                aria-label={`Ouvrir la fiche de ${r.prenom} ${r.nom} (nouvel onglet)`}
              >
                <TalentAvatar
                  talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
                  size="sm"
                />
              </a>
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
            <!-- Notes icon, always present (every talent can have notes). State
                 reads from the icon's own colour, never a count badge (which
                 looked like a notification): muted at rest, blue once a note
                 exists, lit when the latest note falls in the active créneau. The
                 tint, not the bodies, lives on the roster. -->
            <Table.Cell class="text-right">
              {@const count = rowNoteCount(r)}
              {@const live = rowNoteInActiveSlot(r)}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="ghost"
                      size="icon"
                      class={noteTriggerClass(r)}
                      onclick={() => openNotes(r)}
                      aria-label={`Notes de ${r.prenom} ${r.nom}`}
                    >
                      <NotebookPen class="h-4 w-4" />
                    </Button>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content class="max-w-72">
                  {#if live}
                    Noté sur ce créneau · cliquer pour voir
                  {:else if count > 0}
                    {count} note{count > 1 ? 's' : ''} · cliquer pour voir
                  {:else}
                    Ajouter une note
                  {/if}
                </Tooltip.Content>
              </Tooltip.Root>
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
                <!-- Avatar is the fiche link here too (new tab); the name and
                     action buttons stay non-navigating so they're safe to tap
                     on the floor. -->
                <a
                  href={ficheHref(r.talentId)}
                  target="_blank"
                  rel="noopener"
                  class="inline-flex shrink-0"
                  title="Voir la fiche"
                  aria-label={`Ouvrir la fiche de ${r.prenom} ${r.nom} (nouvel onglet)`}
                >
                  <TalentAvatar
                    talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
                    size="sm"
                  />
                </a>
                <p class="min-w-0 flex-1 truncate text-sm">
                  <span class="font-medium">{r.prenom}</span>
                  <span class="font-bold uppercase">{r.nom}</span>
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  class={noteTriggerClass(r, true)}
                  onclick={() => openNotes(r)}
                  aria-label={`Notes de ${r.prenom} ${r.nom}`}
                >
                  <NotebookPen class="h-4 w-4" />
                </Button>
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
                <!-- Auto-closed by the clock (past 11h / 15h) and not reopenable.
                     Clôturer is spent, so it sits disabled in its usual spot
                     while Tout présent stays live and same-width: staff are often
                     émargeant late and per-row marking already works on a closed
                     slot, so the bulk shortcut should too. -->
                <div class="@container space-y-2">
                  <div class="grid grid-cols-1 gap-2 @[21rem]:grid-cols-2">
                    <Button
                      variant="outline"
                      size="sm"
                      class="w-full rounded-sm whitespace-nowrap"
                      onclick={() => (presentConfirmOpen = true)}
                    >
                      <CheckCheck class="mr-1.5 h-4 w-4" />
                      Tout présent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      class="w-full rounded-sm whitespace-nowrap"
                    >
                      <Lock class="mr-1.5 h-4 w-4" />
                      Clôturé
                    </Button>
                  </div>
                  <p class="text-[11px] leading-snug text-muted-foreground">
                    Clôturé automatiquement passé {slotLabelFr(
                      activeSlot.slot,
                    ) === 'Matin'
                      ? '11h'
                      : '15h'}. Le marquage reste possible.
                  </p>
                </div>
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
                <div class="@container space-y-2">
                  <!-- Side by side when the card is wide enough, stacked when
                       it is not. The threshold tracks the card, not the
                       viewport: the rail makes this card full-width at xl but
                       half-width in the sm two-up, where a 2-col grid clips
                       "Tout présent" onto two lines with the icon stranded. -->
                  <div class="grid grid-cols-1 gap-2 @[21rem]:grid-cols-2">
                    <Button
                      variant="outline"
                      size="sm"
                      class="w-full rounded-sm whitespace-nowrap"
                      onclick={() => (presentConfirmOpen = true)}
                    >
                      <CheckCheck class="mr-1.5 h-4 w-4" />
                      Tout présent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      class="w-full rounded-sm whitespace-nowrap"
                      onclick={() => (closeConfirmOpen = true)}
                    >
                      <Lock class="mr-1.5 h-4 w-4" />
                      Clôturer
                    </Button>
                  </div>
                  <p class="text-[11px] leading-snug text-muted-foreground">
                    En fin de créneau : marquez tout le monde présent, ou
                    clôturez pour noter absents ceux qui restent « en attente ».
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
              stageRate={attendanceRate}
              footer={canEdit ? slotLifecycle : undefined}
            />
            <PresenceHelpCard />
          </div>
        {/if}
      </aside>
    </div>
  {/if}
</Tooltip.Provider>

<!-- Contact card: phones to reach the stagiaire, then the family if no answer -->
<ContactDialog bind:open={contactOpen} row={contactTarget} />

<NotesDialog
  bind:open={notesOpen}
  row={notesTarget}
  {eventId}
  {timezone}
  {activeSlot}
  onCountChange={onNoteCountChange}
/>

<!-- Mark-all-present confirmation -->
<Dialog.Root bind:open={presentConfirmOpen}>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Marquer tout le monde présent ?</Dialog.Title>
      <Dialog.Description>
        Tous les stagiaires sans présence enregistrée sur ce créneau passeront
        présents. Les présences déjà saisies (présent, absent, justifié, en
        retard) ne sont pas modifiées.
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
              toast.success(
                'Stagiaires sans présence enregistrée marqués présents.',
              );
            // The bulk mark only fails now if a staff member manually closed the
            // créneau between render and submit; the 11h/15h cutoff no longer
            // refuses it. Surface the server message, which points at Rouvrir.
            else if (result.type === 'failure')
              toast.error(
                (result.data?.form as { message?: string } | undefined)
                  ?.message ?? 'Ce créneau a été clôturé.',
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
