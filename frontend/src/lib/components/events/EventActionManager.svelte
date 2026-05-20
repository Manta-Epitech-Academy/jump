<script lang="ts">
  import DuplicateEventDialog from '$lib/components/events/DuplicateEventDialog.svelte';

  let duplicateDialogOpen = $state(false);
  let eventToDuplicate = $state<{
    id: string;
    titre: string;
    date: Date;
  } | null>(null);

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
