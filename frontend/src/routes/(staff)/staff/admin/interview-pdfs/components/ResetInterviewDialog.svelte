<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { buttonVariants } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { formatDateTimeFr } from '$lib/utils';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  type ResetTarget = {
    id: string;
    talentName: string;
    staffName: string;
    conductedAt: string;
  };

  let {
    open = $bindable(false),
    target,
  }: {
    open: boolean;
    target: ResetTarget | null;
  } = $props();

  const REASON_MAX = 500;
  let reason = $state('');
  let resetting = $state(false);

  // Clear the reason whenever the dialog opens for a (possibly different) target,
  // so a prior draft never leaks onto the next interview.
  $effect(() => {
    if (open) reason = '';
  });

  const canSubmit = $derived(reason.trim().length > 0 && !resetting);
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="font-heading text-xl tracking-tight uppercase">
        Réinitialiser l'entretien
      </AlertDialog.Title>
      <AlertDialog.Description>
        Cette action supprime définitivement l'entretien finalisé et sa
        synthèse. Le talent repassera en « à faire » et un nouvel entretien
        pourra être conduit depuis l'espace dev. Action irréversible.
      </AlertDialog.Description>
    </AlertDialog.Header>

    {#if target}
      <div class="rounded-sm border bg-muted/40 p-3 text-sm">
        <p class="font-medium">{target.talentName}</p>
        <p class="mt-0.5 font-mono text-xs text-muted-foreground">
          Conduit par {target.staffName} le {formatDateTimeFr(
            target.conductedAt,
          )}
        </p>
      </div>

      <form
        action="?/reset"
        method="POST"
        use:enhance={() => {
          resetting = true;
          return async ({ result, update }) => {
            resetting = false;
            if (result.type === 'success') {
              toast.success('Entretien réinitialisé');
              open = false;
              await update();
            } else {
              const message =
                result.type === 'failure' &&
                typeof result.data?.error === 'string'
                  ? result.data.error
                  : 'Échec de la réinitialisation';
              toast.error(message);
            }
          };
        }}
      >
        <input type="hidden" name="id" value={target.id} />

        <div class="space-y-1.5">
          <Label for="reset-reason" class="text-xs">Motif (obligatoire)</Label>
          <Textarea
            id="reset-reason"
            name="reason"
            bind:value={reason}
            maxlength={REASON_MAX}
            rows={3}
            placeholder="Ex. : entretien créé par erreur lors d'un test."
            class="resize-none"
          />
        </div>

        <AlertDialog.Footer class="mt-4">
          <AlertDialog.Cancel type="button" disabled={resetting}>
            Annuler
          </AlertDialog.Cancel>
          <AlertDialog.Action
            type="submit"
            disabled={!canSubmit}
            class={buttonVariants({ variant: 'destructive' })}
          >
            {#if resetting}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
              Réinitialisation...
            {:else}
              Réinitialiser
            {/if}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </form>
    {/if}
  </AlertDialog.Content>
</AlertDialog.Root>
