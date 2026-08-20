<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { toast } from 'svelte-sonner';
  import { base } from '$app/paths';
  import { cn } from '$lib/utils';
  import { slotKey } from '$lib/domain/eventPresence';
  import type { PresenceSlot } from '@prisma/client';
  import type { SerializedNote } from '$lib/domain/talentNotes';
  import TalentNoteEditor from './TalentNoteEditor.svelte';
  import TalentNoteCard from './TalentNoteCard.svelte';

  // The multi-note feed for a talent: a list of staff notes (newest first) with a
  // composer to add more, and inline edit/delete on the ones the viewer may
  // manage. Replaces the old single-note panel. Shared by the dev fiche and the
  // émargement dialog; the dialog passes `eventId` so new notes are anchored to
  // the event they were taken at.
  let {
    talentId,
    notes,
    timezone,
    eventId = null,
    presenceDay = null,
    presenceSlot = null,
    onCountChange,
    composing = $bindable(false),
    showComposeButton = true,
    showStaffOnlyHint = true,
    listMaxHeightClass = 'max-h-[60vh]',
    highlightLabel,
  }: {
    talentId: string;
    notes: SerializedNote[];
    // Campus IANA timezone, forwarded to each card so note timestamps read in the
    // campus wall clock (see TalentNoteCard — the fiche feed is SSR'd under UTC).
    timezone: string;
    eventId?: string | null;
    // The active émargement créneau (the dialog passes the slot on screen). Two
    // roles: it's the anchor persisted on a NEW note, and it selects which existing
    // notes lift into the "Ce créneau" group (those whose stored anchor matches).
    // Null on the fiche, where notes carry no créneau. Ignored when editing.
    presenceDay?: string | null;
    presenceSlot?: PresenceSlot | null;
    // Fired with the new note count after a create/delete, so a host (the
    // émargement dialog) can keep its roster icon tint in sync.
    onCountChange?: (count: number) => void;
    // The composer is bindable so a host can drive it from outside the feed: the
    // dev fiche opens it from the "Ajouter une note" button in the card header.
    composing?: boolean;
    // The fiche moves the add button into the EpiSection header and hides this
    // inline one; the émargement dialog (no such header) keeps it.
    showComposeButton?: boolean;
    // The "visible uniquement par le staff" foot caveat. Off in the émargement
    // dialog, whose own description already states it, so it shows once per surface.
    showStaffOnlyHint?: boolean;
    // Cap on the scrolling note list. The dialog is a dedicated surface so 60vh
    // suits it; the fiche rail passes a shorter cap so the Synthèse below stays in
    // view instead of being pushed off by a long feed.
    listMaxHeightClass?: string;
    // Short tag rendered above the "Ce créneau" group (e.g. "Ce créneau · lun. 9
    // juin · Matin"), so the label travels with the grouped notes. The caller owns
    // the wording; no tag shows without it.
    highlightLabel?: string;
  } = $props();

  // The feed owns the list after mount, applying create/edit/delete results so it
  // never re-fetches the page. Seeding from the prop once is intentional.
  // svelte-ignore state_referenced_locally
  let items = $state<SerializedNote[]>([...notes]);
  let editingId = $state<string | null>(null);
  let deleteOpen = $state(false);
  let deleteTarget = $state<SerializedNote | null>(null);
  // In-flight guard for the delete confirm: disables the footer buttons and shows
  // a spinner so the destructive action can't be double-fired while the request runs.
  let deleting = $state(false);

  // On the émargement créneau the feed splits in two: notes whose stored anchor
  // matches the active créneau lift into a bounded group at the top (so staff see
  // "what was left this créneau" at a glance, one header, clear edges, no
  // scrolling) and the rest fall under "Autres". Matching on each note's own
  // `presenceSlotKey` means a note just added here joins the group immediately,
  // with no round-trip. `items` itself is untouched, so the reported count and
  // add/edit/delete are unchanged; this is purely how the list renders. On the
  // fiche (no active créneau) nothing groups and the flat list shows.
  const activeSlotKey = $derived(
    presenceDay && presenceSlot ? slotKey(presenceDay, presenceSlot) : null,
  );
  const slotNotes = $derived(
    activeSlotKey
      ? items.filter((n) => n.presenceSlotKey === activeSlotKey)
      : [],
  );
  const otherNotes = $derived(
    activeSlotKey
      ? items.filter((n) => n.presenceSlotKey !== activeSlotKey)
      : items,
  );

  async function deleteNote(note: SerializedNote) {
    if (deleting) return;
    deleting = true;
    try {
      const res = await fetch(
        `${base}/staff/dev/students/${talentId}/notes/${note.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(String(res.status));
      items = items.filter((n) => n.id !== note.id);
      onCountChange?.(items.length);
      toast.success('Note supprimée.');
      // bits-ui's AlertDialog.Action is a plain button (no auto-close), so the
      // confirm only dismisses if we close it ourselves. Close on success;
      // leave it open on error so the toast lands with the dialog still in view.
      deleteOpen = false;
    } catch (e) {
      console.error('delete talent note', e);
      toast.error('Échec de la suppression de la note.');
    } finally {
      deleting = false;
    }
  }
</script>

<!-- One note row, shared by the flat list and the two grouped sections so the
     edit/delete wiring lives in a single place. -->
{#snippet noteRow(note: SerializedNote)}
  {#if editingId === note.id}
    <div class="rounded-sm border bg-muted/20 p-3">
      <TalentNoteEditor
        {talentId}
        {note}
        onSaved={(saved) => {
          items = items.map((n) => (n.id === saved.id ? saved : n));
          editingId = null;
        }}
        onCancel={() => (editingId = null)}
      />
    </div>
  {:else}
    <TalentNoteCard
      {note}
      {timezone}
      onEdit={() => (editingId = note.id)}
      onDelete={() => {
        deleteTarget = note;
        deleteOpen = true;
      }}
    />
  {/if}
{/snippet}

<!-- One tooltip provider for the whole feed: the cards' edit/delete and "modifié"
     tooltips need it, and the émargement dialog portals the feed away from the
     roster's own provider, so the feed must carry its own. -->
<Tooltip.Provider delayDuration={150}>
  <!-- min-w-0: this is a grid item of the émargement Dialog.Content (display:grid).
       Without it the item keeps its min-content width and overflows the dialog on a
       narrow screen (the note cards then never get a bounded width to truncate into). -->
  <div class="min-w-0 space-y-3">
    {#if showComposeButton && !composing}
      <div class="flex justify-end">
        <Button size="sm" variant="outline" onclick={() => (composing = true)}>
          <Plus class="mr-1.5 h-3.5 w-3.5" />
          Ajouter une note
        </Button>
      </div>
    {/if}

    {#if composing}
      <div class="rounded-sm border bg-muted/20 p-3">
        <TalentNoteEditor
          {talentId}
          {eventId}
          {presenceDay}
          {presenceSlot}
          onSaved={(saved) => {
            items = [saved, ...items];
            onCountChange?.(items.length);
            composing = false;
          }}
          onCancel={() => (composing = false)}
        />
      </div>
    {/if}

    {#if items.length === 0 && !composing}
      <p class="text-sm text-muted-foreground italic">
        Aucune note pour le moment.
      </p>
    {:else}
      <!-- Every note shows (no count cap), but the list scrolls past a screenful so
         a talent with many notes never blows out the dialog or the fiche rail. The
         composer and the staff-only caveat stay outside this scroll region. The cap
         lands mid-card (notes are variable height); the partial note left peeking is
         the affordance that says "more below". -->
      <div class={cn('space-y-3 overflow-y-auto pr-1', listMaxHeightClass)}>
        {#if slotNotes.length > 0}
          <section
            class="space-y-2 rounded-md bg-epi-blue/5 p-2 ring-1 ring-epi-blue/20"
          >
            {#if highlightLabel}
              <h3
                class="flex items-center gap-1.5 px-1 text-xs font-medium text-epi-blue"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-epi-blue"></span>
                {highlightLabel}
              </h3>
            {/if}
            {#each slotNotes as note (note.id)}
              {@render noteRow(note)}
            {/each}
          </section>
          {#if otherNotes.length > 0}
            <div class="space-y-2">
              <h3 class="px-1 text-xs font-medium text-muted-foreground">
                Autres
              </h3>
              {#each otherNotes as note (note.id)}
                {@render noteRow(note)}
              {/each}
            </div>
          {/if}
        {:else}
          <div class="space-y-2">
            {#each items as note (note.id)}
              {@render noteRow(note)}
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Confidentiality caveat at the foot of the feed: a standing reminder, not
       the first thing to read, so it stays quiet under the notes. -->
    {#if showStaffOnlyHint}
      <p class="text-xs text-muted-foreground">
        Visible uniquement par le staff.
      </p>
    {/if}
  </div>
</Tooltip.Provider>

<AlertDialog.Root bind:open={deleteOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Supprimer la note ?</AlertDialog.Title>
      <AlertDialog.Description>
        Cette note sera définitivement supprimée. Cette action est irréversible.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={deleting}>Annuler</AlertDialog.Cancel>
      <AlertDialog.Action
        class={buttonVariants({ variant: 'destructive' })}
        disabled={deleting}
        onclick={() => {
          if (deleteTarget) deleteNote(deleteTarget);
        }}
      >
        {#if deleting}
          <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Suppression...
        {:else}
          Supprimer
        {/if}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
