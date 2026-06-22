<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { toast } from 'svelte-sonner';
  import { base } from '$app/paths';
  import { cn } from '$lib/utils';
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
    onCountChange,
    composing = $bindable(false),
    showComposeButton = true,
    showStaffOnlyHint = true,
    listMaxHeightClass = 'max-h-[60vh]',
    highlightIds = [],
  }: {
    talentId: string;
    notes: SerializedNote[];
    // Campus IANA timezone, forwarded to each card so note timestamps read in the
    // campus wall clock (see TalentNoteCard — the fiche feed is SSR'd under UTC).
    timezone: string;
    eventId?: string | null;
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
    // Ids of notes to flag (ring) and reveal (scroll the first into view). The
    // émargement dialog passes the note(s) taken during the créneau it was opened
    // on, so staff land on "what was left this créneau" instead of hunting it down
    // a long, newest-first feed. Empty everywhere else (the fiche never sets it).
    highlightIds?: string[];
  } = $props();

  // The feed owns the list after mount, applying create/edit/delete results so it
  // never re-fetches the page. Seeding from the prop once is intentional.
  // svelte-ignore state_referenced_locally
  let items = $state<SerializedNote[]>([...notes]);
  let editingId = $state<string | null>(null);
  let deleteOpen = $state(false);
  let deleteTarget = $state<SerializedNote | null>(null);

  const highlight = $derived(new Set(highlightIds));
  // Only the first (newest) match is scrolled to; the rest just ring in place.
  const firstHighlightId = $derived(
    items.find((n) => highlight.has(n.id))?.id ?? null,
  );

  // One-shot reveal on mount. The dialog remounts the feed per talent (keyed), so
  // each fresh open re-runs it; rAF defers the scroll until after first paint.
  function reveal(node: HTMLElement, active: boolean) {
    if (active)
      requestAnimationFrame(() => node.scrollIntoView({ block: 'nearest' }));
  }

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
<Tooltip.Provider delayDuration={150}>
  <div class="space-y-3">
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
      <div class={cn('space-y-2 overflow-y-auto pr-1', listMaxHeightClass)}>
        {#each items as note (note.id)}
          <div
            class={cn(
              highlight.has(note.id) &&
                'rounded-sm ring-2 ring-epi-blue/40 ring-offset-2 ring-offset-background',
            )}
            use:reveal={note.id === firstHighlightId}
          >
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
          </div>
        {/each}
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
