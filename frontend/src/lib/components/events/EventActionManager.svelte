<script lang="ts">
  import DuplicateEventDialog from '$lib/components/events/DuplicateEventDialog.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { m } from '$lib/paraglide/messages.js';

  let deleteDialogOpen = $state(false);
  let eventToDelete = $state<string | null>(null);
  let duplicateDialogOpen = $state(false);
  let eventToDuplicate = $state<{
    id: string;
    titre: string;
    date: Date;
  } | null>(null);

  export function confirmDelete(id: string) {
    eventToDelete = id;
    deleteDialogOpen = true;
  }

  export function openDuplicate(event: {
    id: string;
    titre: string;
    date: Date;
  }) {
    eventToDuplicate = event;
    duplicateDialogOpen = true;
  }
</script>

<DuplicateEventDialog bind:open={duplicateDialogOpen} {eventToDuplicate} />

<ConfirmDeleteDialog
  bind:open={deleteDialogOpen}
  action="?/deleteEvent&id={eventToDelete}"
  title={m.event_delete_title()}
  description={m.event_delete_description()}
  buttonText={m.common_delete_permanently()}
/>
