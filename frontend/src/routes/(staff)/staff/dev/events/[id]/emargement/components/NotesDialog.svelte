<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { base } from '$app/paths';
  import TalentNotesFeed from '$lib/components/dev/notes/TalentNotesFeed.svelte';
  import type { SerializedNote } from '$lib/domain/talentNotes';
  import type { PresenceRow } from './types';

  // Per-row notes modal: shows the talent's full notes feed without leaving the
  // émargement table. The roster carries only a count, so the bodies are
  // lazy-loaded here on open. New notes are anchored to this event (`eventId`).
  let {
    open = $bindable(),
    row,
    eventId,
    onCountChange,
  }: {
    open: boolean;
    row: PresenceRow | null;
    eventId: string;
    onCountChange?: (talentId: string, count: number) => void;
  } = $props();

  let notes = $state<SerializedNote[] | null>(null);
  let loadError = $state(false);
  let requestedFor = $state<string | null>(null);

  // Fetch fresh on each open, once per targeted talent. Closing resets the guard
  // so the next open re-pulls (another staff member may have added notes since).
  $effect(() => {
    if (!open) {
      requestedFor = null;
      return;
    }
    if (!row || requestedFor === row.talentId) return;
    const talentId = row.talentId;
    requestedFor = talentId;
    notes = null;
    loadError = false;
    fetch(`${base}/staff/dev/students/${talentId}/notes`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        notes = data.notes as SerializedNote[];
      })
      .catch((e) => {
        console.error('load talent notes', e);
        loadError = true;
      });
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-lg">
    {#if row}
      <Dialog.Header>
        <Dialog.Title>Notes - {row.prenom} {row.nom}</Dialog.Title>
        <Dialog.Description>
          Notes réservées au staff (retard, administratif, pédagogique…).
        </Dialog.Description>
      </Dialog.Header>
      {#if loadError}
        <p class="py-6 text-center text-sm text-muted-foreground">
          Impossible de charger les notes.
        </p>
      {:else if notes === null}
        <div
          class="flex items-center justify-center py-8 text-muted-foreground"
        >
          <LoaderCircle class="h-5 w-5 animate-spin" />
        </div>
      {:else}
        {#key row.talentId}
          <TalentNotesFeed
            talentId={row.talentId}
            {notes}
            {eventId}
            showStaffOnlyHint={false}
            onCountChange={(count) => onCountChange?.(row.talentId, count)}
          />
        {/key}
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
