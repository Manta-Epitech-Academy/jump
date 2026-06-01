<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import MoreVertical from '@lucide/svelte/icons/more-vertical';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import XCircle from '@lucide/svelte/icons/x-circle';
  import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
  import ClipboardList from '@lucide/svelte/icons/clipboard-list';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { track, errReason } from '$lib/analytics';
  import { page } from '$app/state';

  type Props = {
    interviewId: string;
    canMutate: boolean;
    canReassign: boolean;
    onOpenGrid: () => void;
    onOpenReassign: () => void;
  };

  let {
    interviewId,
    canMutate,
    canReassign,
    onOpenGrid,
    onOpenReassign,
  }: Props = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon"
        class="h-8 w-8 rounded-sm"
        aria-label="Actions"
      >
        <MoreVertical class="h-4 w-4" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="rounded-sm">
    <DropdownMenu.Item onclick={onOpenGrid} class="cursor-pointer">
      <ClipboardList class="mr-2 h-4 w-4" />
      Voir / éditer la grille
    </DropdownMenu.Item>
    {#if canMutate}
      <DropdownMenu.Separator />
      <form
        action="?/updateStatus"
        method="POST"
        use:enhance={() =>
          async ({ result, update }) => {
            if (result.type === 'success') {
              track('interview_status_changed', {
                toStatus: 'completed',
                interviewId,
                eventId: page.params.id,
              });
              toast.success('Statut mis à jour');
              await update();
            } else {
              toast.error('Échec de la mise à jour');
            }
          }}
      >
        <input type="hidden" name="id" value={interviewId} />
        <input type="hidden" name="status" value="completed" />
        <button type="submit" class="w-full">
          <DropdownMenu.Item class="cursor-pointer">
            <CheckCircle2 class="mr-2 h-4 w-4 text-epi-teal-solid" />
            Marquer fait
          </DropdownMenu.Item>
        </button>
      </form>
      <form
        action="?/updateStatus"
        method="POST"
        use:enhance={() =>
          async ({ result, update }) => {
            if (result.type === 'success') {
              track('interview_status_changed', {
                toStatus: 'cancelled',
                interviewId,
                eventId: page.params.id,
              });
              toast.success('Entretien annulé');
              await update();
            } else {
              toast.error('Échec de l’annulation');
            }
          }}
      >
        <input type="hidden" name="id" value={interviewId} />
        <input type="hidden" name="status" value="cancelled" />
        <button type="submit" class="w-full">
          <DropdownMenu.Item class="cursor-pointer text-destructive">
            <XCircle class="mr-2 h-4 w-4" />
            Annuler
          </DropdownMenu.Item>
        </button>
      </form>
    {/if}
    {#if canReassign}
      <DropdownMenu.Separator />
      <DropdownMenu.Item onclick={onOpenReassign} class="cursor-pointer">
        <RefreshCcw class="mr-2 h-4 w-4" />
        Réassigner
      </DropdownMenu.Item>
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
