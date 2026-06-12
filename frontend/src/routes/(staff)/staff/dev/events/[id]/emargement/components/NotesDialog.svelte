<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import TalentNoteEditor from '$lib/components/dev/notes/TalentNoteEditor.svelte';
  import type { PresenceRow } from './types';

  // Per-row note modal: wraps the shared TalentNoteEditor so staff can jot a
  // note (e.g. "en retard") without leaving the émargement table.
  let {
    open = $bindable(),
    row,
    onsaved,
  }: {
    open: boolean;
    row: PresenceRow | null;
    onsaved?: (talentId: string, note: string | null) => void;
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    {#if row}
      <Dialog.Header>
        <Dialog.Title>Notes - {row.prenom} {row.nom}</Dialog.Title>
        <Dialog.Description>
          Note libre réservée au staff (retard, administratif…).
        </Dialog.Description>
      </Dialog.Header>
      <TalentNoteEditor
        talentId={row.talentId}
        note={row.note}
        onSaved={(note) => onsaved?.(row.talentId, note)}
      />
    {/if}
  </Dialog.Content>
</Dialog.Root>
