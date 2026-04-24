<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { buttonVariants } from '$lib/components/ui/button';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { LoaderCircle } from '@lucide/svelte';

  let {
    open = $bindable(false),
    action,
    title = 'Êtes-vous sûr ?',
    description = 'Cette action est irréversible.',
    buttonText = 'Supprimer',
    onSuccess,
  }: {
    open: boolean;
    action: string;
    title?: string;
    description?: string;
    buttonText?: string;
    onSuccess?: () => void;
  } = $props();

  let deleting = $state(false);
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="font-heading text-xl tracking-tight uppercase"
        >{title}</AlertDialog.Title
      >
      <AlertDialog.Description>{description}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={deleting}>Annuler</AlertDialog.Cancel>
      <form
        {action}
        method="POST"
        use:enhance={() => {
          deleting = true;
          return async ({ result, update }) => {
            deleting = false;
            if (result.type === 'success' || result.type === 'redirect') {
              if (result.type === 'success') {
                toast.success('Action effectuée');
              }
              open = false;
              if (onSuccess) onSuccess();
              await update();
            } else {
              toast.error('Une erreur est survenue');
            }
          };
        }}
      >
        <AlertDialog.Action
          type="submit"
          disabled={deleting}
          class={buttonVariants({ variant: 'destructive' })}
        >
          {#if deleting}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Suppression...
          {:else}
            {buttonText}
          {/if}
        </AlertDialog.Action>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
