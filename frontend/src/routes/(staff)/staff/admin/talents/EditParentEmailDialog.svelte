<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';

  // Edit the email parent-1 connects with. The server action keeps the parent's
  // bauth_user.email in lockstep with Talent.parentEmail, so this dialog only
  // collects the new address + whether to re-send the connection link.
  let {
    open = $bindable(false),
    talent,
  }: {
    open?: boolean;
    talent: {
      id: string;
      parentEmail: string | null;
      parentName: string | null;
    } | null;
  } = $props();

  let email = $state('');
  let resendWelcome = $state(true);
  let saving = $state(false);

  // Reseed the field whenever the dialog opens on a (possibly different) talent.
  $effect(() => {
    if (open && talent) {
      email = talent.parentEmail ?? '';
      resendWelcome = true;
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="font-heading text-xl tracking-tight uppercase">
        Email du parent
      </Dialog.Title>
      <Dialog.Description>
        Adresse avec laquelle {talent?.parentName || 'le parent'} se connecte à l'espace
        parent. La corriger met aussi à jour son compte de connexion : il pourra se
        connecter avec la nouvelle adresse.
      </Dialog.Description>
    </Dialog.Header>

    {#if talent}
      <form
        method="POST"
        action="?/updateParentEmail"
        use:enhance={() => {
          saving = true;
          return async ({ result, update }) => {
            saving = false;
            if (result.type === 'success') {
              toast.success(
                (result.data?.message as string) ?? 'Email mis à jour.',
              );
              open = false;
              await update();
            } else if (result.type === 'failure') {
              toast.error(
                (result.data?.message as string) ??
                  'Échec de la mise à jour de l’email.',
              );
            }
          };
        }}
        class="space-y-4"
      >
        <input type="hidden" name="talentId" value={talent.id} />

        <div class="space-y-2">
          <Label for="parent-email">Adresse email</Label>
          <Input
            id="parent-email"
            name="email"
            type="email"
            bind:value={email}
            placeholder="parent@example.com"
            autocomplete="off"
            required
            class="rounded-sm"
          />
        </div>

        <label class="flex items-start gap-2 text-sm">
          <Checkbox
            name="resendWelcome"
            bind:checked={resendWelcome}
            class="mt-0.5"
          />
          <span class="text-muted-foreground">
            Envoyer le lien de connexion à cette adresse
          </span>
        </label>

        <Dialog.Footer>
          <Dialog.Close
            class={buttonVariants({ variant: 'outline' })}
            disabled={saving}
          >
            Annuler
          </Dialog.Close>
          <Button type="submit" disabled={saving}>
            {#if saving}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
            {/if}
            Enregistrer
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
