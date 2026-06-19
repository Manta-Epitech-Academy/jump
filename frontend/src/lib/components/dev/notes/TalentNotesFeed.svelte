<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { toast } from 'svelte-sonner';
  import { base } from '$app/paths';
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
    eventId = null,
    onCountChange,
  }: {
    talentId: string;
    notes: SerializedNote[];
    eventId?: string | null;
    // Fired with the new note count after a create/delete, so a host (the
    // émargement dialog) can keep its roster icon tint in sync.
    onCountChange?: (count: number) => void;
  } = $props();

  // The feed owns the list after mount, applying create/edit/delete results so it
  // never re-fetches the page. Seeding from the prop once is intentional.
  // svelte-ignore state_referenced_locally
  let items = $state<SerializedNote[]>([...notes]);
  let composing = $state(false);
  let editingId = $state<string | null>(null);
  let deleteOpen = $state(false);
  let deleteTarget = $state<SerializedNote | null>(null);

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

<div class="space-y-3">
  {#if !composing}
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        Visible uniquement par le staff.
      </p>
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
    <div class="space-y-2">
      {#each items as note (note.id)}
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
            onEdit={() => (editingId = note.id)}
            onDelete={() => {
              deleteTarget = note;
              deleteOpen = true;
            }}
          />
        {/if}
      {/each}
    </div>
  {/if}
</div>

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
