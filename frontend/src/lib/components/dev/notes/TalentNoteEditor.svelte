<script lang="ts">
  import { Textarea } from '#lib/components/ui/textarea/index.ts';
  import { Button } from '#lib/components/ui/button/index.ts';
  import { toast } from 'svelte-sonner';
  import { isHttpError } from '@sveltejs/kit';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import type { PresenceSlot } from '@prisma/client';
  import type { SerializedNote } from '#lib/domain/talentNotes.ts';
  import { createTalentNote, editTalentNote } from './talentNotes.remote';

  // Composer for a single staff note: create (note=null) or edit an existing
  // one. Shared by the fiche feed and the émargement dialog. Editing uses
  // per-note optimistic concurrency: it sends the `updatedAt` it loaded and, on a
  // conflict, surfaces the concurrent version instead of clobbering it.
  let {
    talentId,
    note = null,
    eventId = null,
    presenceDay = null,
    presenceSlot = null,
    onSaved,
    onCancel,
  }: {
    talentId: string;
    note?: SerializedNote | null;
    // Optional context anchor for a NEW note (émargement passes the current
    // event); ignored when editing.
    eventId?: string | null;
    // The émargement créneau the new note is taken on (day + half), persisted with
    // the event so the note anchors to that créneau. Null on the fiche.
    presenceDay?: string | null;
    presenceSlot?: PresenceSlot | null;
    onSaved?: (note: SerializedNote) => void;
    onCancel?: () => void;
  } = $props();

  // Seed the edit buffer once from the loaded note: the editor owns its state
  // after mount (it remounts per note and per dialog open), so capturing only the
  // initial prop values is intentional, not a missed reaction.
  // svelte-ignore state_referenced_locally
  let value = $state(note?.body ?? '');
  // svelte-ignore state_referenced_locally
  let baseUpdatedAt = $state(note?.updatedAt ?? null);
  let saving = $state(false);
  let conflict = $state<SerializedNote | null>(null);

  const isEdit = $derived(note !== null);
  const dirty = $derived(
    value.trim().length > 0 && value.trim() !== (note?.body ?? ''),
  );

  async function save(force = false) {
    if (saving || !value.trim()) return;
    saving = true;
    try {
      let saved: SerializedNote;
      if (isEdit) {
        const result = await editTalentNote({
          talentId,
          noteId: note!.id,
          edit: {
            body: value,
            baseUpdatedAt: force ? conflict!.updatedAt : baseUpdatedAt!,
          },
        });
        if (result.outcome === 'conflict') {
          conflict = result.note;
          return;
        }
        saved = result.note;
      } else {
        saved = await createTalentNote({
          talentId,
          note: {
            body: value,
            eventId: eventId ?? undefined,
            presenceDay: presenceDay ?? undefined,
            presenceSlot: presenceSlot ?? undefined,
          },
        });
      }
      conflict = null;
      onSaved?.(saved);
      toast.success('Note enregistrée.');
    } catch (e) {
      // A refusal carries the server's own reason, in French. A crash or a lost
      // connection is left out: SvelteKit's « Internal Error » and the
      // browser's own English say nothing to act on.
      console.error('save talent note', e);
      saveFailed(isHttpError(e) && e.status < 500 ? e.body.message : undefined);
    } finally {
      saving = false;
    }
  }

  // The text stays in the editor, which is the one thing the person needs to
  // know before trying again.
  function saveFailed(reason?: string) {
    toast.error(reason ?? "La note n'a pas été enregistrée.", {
      description: 'Votre texte est conservé : réessayez.',
    });
  }

  function takeCurrent() {
    if (!conflict) return;
    value = conflict.body;
    baseUpdatedAt = conflict.updatedAt;
    conflict = null;
  }
</script>

<div class="space-y-2">
  <Textarea
    bind:value
    rows={5}
    disabled={saving}
    maxlength={5000}
    placeholder="Retard, posture, administratif…"
    class="min-h-24 resize-y"
    aria-invalid={conflict ? true : undefined}
  />

  {#if conflict}
    <div
      class="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      <p class="flex items-center gap-1.5 font-medium text-warning">
        <TriangleAlert class="h-4 w-4" />
        Note modifiée par un autre membre du staff depuis l'ouverture.
      </p>
      <div class="rounded border bg-background p-2 text-muted-foreground">
        <p class="mb-1 text-xs font-semibold uppercase">Version actuelle</p>
        <p class="whitespace-pre-wrap">{conflict.body}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onclick={takeCurrent}>
          Reprendre la version actuelle
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={saving}
          onclick={() => save(true)}
        >
          Écraser avec ma version
        </Button>
      </div>
    </div>
  {/if}

  <div class="flex items-center justify-end gap-2">
    {#if onCancel}
      <Button size="sm" variant="ghost" onclick={onCancel} disabled={saving}>
        Annuler
      </Button>
    {/if}
    <Button
      size="sm"
      onclick={() => save()}
      disabled={saving || (isEdit ? !dirty : !value.trim())}
    >
      {#if saving}
        <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
        Enregistrement…
      {:else}
        {isEdit ? 'Enregistrer' : 'Ajouter'}
      {/if}
    </Button>
  </div>
</div>
