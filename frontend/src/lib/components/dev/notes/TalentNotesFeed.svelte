<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { toast } from 'svelte-sonner';
  import { base } from '$app/paths';
  import { cn } from '$lib/utils';
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
    highlightIds = [],
    highlightLabel,
  }: {
    talentId: string;
    notes: SerializedNote[];
    // Campus IANA timezone, forwarded to each card so note timestamps read in the
    // campus wall clock (see TalentNoteCard — the fiche feed is SSR'd under UTC).
    timezone: string;
    eventId?: string | null;
    // The émargement créneau a NEW note is taken on (the dialog passes the active
    // slot), persisted so the note anchors to that créneau. Null on the fiche, where
    // notes carry no créneau. Ignored when editing an existing note.
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
    // Ids of notes to flag and reveal (scroll the first into view). The émargement
    // dialog passes the note(s) taken during the créneau it was opened on, so staff
    // land on "what was left this créneau" instead of hunting it down a long,
    // newest-first feed. Empty everywhere else (the fiche never sets it).
    highlightIds?: string[];
    // Short tag rendered just above each flagged note (e.g. "Note de ce créneau"),
    // so the label travels with the note instead of floating off at the top. The
    // caller owns the wording; no tag shows without it.
    highlightLabel?: string;
  } = $props();

  // The feed owns the list after mount, applying create/edit/delete results so it
  // never re-fetches the page. Seeding from the prop once is intentional.
  // svelte-ignore state_referenced_locally
  let items = $state<SerializedNote[]>([...notes]);
  let editingId = $state<string | null>(null);
  let deleteOpen = $state(false);
  let deleteTarget = $state<SerializedNote | null>(null);

  // When the émargement dialog flags a créneau's note(s), the feed splits in two:
  // the flagged ones lift into a bounded group at the top (so staff see "what was
  // left this créneau" at a glance, one header, clear edges, no scrolling) and the
  // rest fall under "Autres notes". `items` itself is untouched, so the reported
  // count and add/edit/delete are unchanged; this is purely how the list renders.
  const highlight = $derived(new Set(highlightIds));
  const grouped = $derived(highlightIds.length > 0);
  const slotNotes = $derived(
    grouped ? items.filter((n) => highlight.has(n.id)) : [],
  );
  const otherNotes = $derived(
    grouped ? items.filter((n) => !highlight.has(n.id)) : items,
  );

  async function deleteNote(note: SerializedNote) {
    try {
      const res = await fetch(
        `${base}/staff/dev/students/${talentId}/notes/${note.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(String(res.status));
      items = items.filter((n) => n.id !== note.id);
      onCountChange?.(items.length);
      toast.success('Note supprimée.');
    } catch (e) {
      console.error('delete talent note', e);
      toast.error('Échec de la suppression de la note.');
    }
  }
</script>

<!-- One tooltip provider for the whole feed: the cards' edit/delete and "modifié"
     tooltips need it, and the émargement dialog portals the feed away from the
     roster's own provider, so the feed must carry its own. -->
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

<!-- min-w-0: this is a grid item of the émargement Dialog.Content (display:grid).
     Without it the item keeps its min-content width and overflows the dialog on a
     narrow screen (the note cards then never get a bounded width to truncate into). -->
<Tooltip.Provider delayDuration={150}>
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
        {#if grouped && slotNotes.length > 0}
          <section
            class="space-y-2 rounded-md bg-epi-blue/5 p-2 ring-1 ring-epi-blue/20"
          >
            {#if highlightLabel}
              <h3
                class="flex items-center gap-1.5 px-1 text-[11px] font-medium text-epi-blue"
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
              <h3 class="px-1 text-[11px] font-medium text-muted-foreground">
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
      <AlertDialog.Title class="font-heading text-xl tracking-tight uppercase">
        Supprimer la note ?
      </AlertDialog.Title>
      <AlertDialog.Description>
        Cette note sera définitivement supprimée. Cette action est irréversible.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
      <AlertDialog.Action
        class={buttonVariants({ variant: 'destructive' })}
        onclick={() => {
          if (deleteTarget) deleteNote(deleteTarget);
        }}
      >
        Supprimer
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
