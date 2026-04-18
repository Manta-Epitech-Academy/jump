<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import MultiStaffSelect from '$lib/components/events/MultiStaffSelect.svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { UsersRound } from '@lucide/svelte';

  let {
    open = $bindable(false),
    eventId,
    eventTitle,
    mantas,
    currentMantaIds,
  }: {
    open: boolean;
    eventId: string;
    eventTitle: string;
    mantas: { id: string; user: { name: string | null } }[];
    currentMantaIds: string[];
  } = $props();

  let selected = $state<string[]>([]);
  let submitting = $state(false);

  $effect(() => {
    if (open) {
      selected = [...currentMantaIds];
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <UsersRound class="h-5 w-5 text-epi-blue" />
        Assigner des Mantas
      </Dialog.Title>
      <Dialog.Description>
        Campagne : <strong>{eventTitle}</strong>
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action="/staff/pedago/events/{eventId}/planning?/assignMantas"
      use:enhance={() => {
        submitting = true;
        return async ({ result, update }) => {
          submitting = false;
          if (result.type === 'success') {
            toast.success('Mantas mis à jour.');
            open = false;
            await update();
          } else if (result.type === 'failure') {
            toast.error('Erreur lors de la mise à jour des Mantas.');
            await update({ reset: false });
          } else {
            await update();
          }
        };
      }}
      class="space-y-4"
    >
      <MultiStaffSelect staff={mantas} bind:value={selected} name="mantas" />

      <Dialog.Footer class="gap-2">
        <Button
          variant="ghost"
          type="button"
          onclick={() => (open = false)}
          disabled={submitting}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
