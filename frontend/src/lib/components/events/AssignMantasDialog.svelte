<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import MultiStaffSelect from '$lib/components/events/MultiStaffSelect.svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { UsersRound, LoaderCircle } from '@lucide/svelte';

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
      <Dialog.Title
        class="flex items-center gap-2 font-heading text-xl tracking-tight uppercase"
      >
        <UsersRound class="h-5 w-5 text-epi-blue" />
        <span class="tracking-wider">Assigner des Mantas</span>
      </Dialog.Title>
      <Dialog.Description>
        Campagne : <strong class="text-foreground uppercase"
          >{eventTitle}</strong
        >
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
      class="space-y-6 pt-4"
    >
      <div class="rounded-sm bg-background">
        <MultiStaffSelect staff={mantas} bind:value={selected} name="mantas" />
      </div>

      <Dialog.Footer class="gap-2">
        <Button
          variant="ghost"
          type="button"
          onclick={() => (open = false)}
          disabled={submitting}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          class="bg-epi-blue text-white shadow-md hover:bg-epi-blue/90 dark:shadow-none"
        >
          {#if submitting}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Enregistrement...
          {:else}
            Enregistrer
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
