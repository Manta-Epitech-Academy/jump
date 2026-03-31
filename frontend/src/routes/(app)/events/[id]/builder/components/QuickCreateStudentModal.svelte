<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { buttonVariants } from '$lib/components/ui/button';
  import { Plus } from 'lucide-svelte';
  import type { SuperForm } from 'sveltekit-superforms/client';
  import type { StudentForm } from '$lib/validation/students';

  let {
    open = $bindable(false),
    createForm,
    createEnhance,
  }: {
    open: boolean;
    createForm: SuperForm<StudentForm>['form'];
    createEnhance: SuperForm<StudentForm>['enhance'];
  } = $props();

  const niveauxScolaires = [
    '6eme',
    '5eme',
    '4eme',
    '3eme',
    '2nde',
    '1ere',
    'Terminale',
    'Sup',
  ];
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger class={buttonVariants({ variant: 'outline', size: 'sm' })}>
    <Plus class="mr-2 h-4 w-4" /> Nouveau
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>Ajout Rapide</Dialog.Title></Dialog.Header>
    <form
      method="POST"
      action="?/quickCreateStudent"
      use:createEnhance
      class="space-y-4 py-4"
    >
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label>Nom</Label>
          <Input name="nom" bind:value={$createForm.nom} />
        </div>
        <div class="space-y-2">
          <Label>Prénom</Label>
          <Input name="prenom" bind:value={$createForm.prenom} />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label>Email (Optionnel)</Label>
          <Input name="email" type="email" bind:value={$createForm.email} />
        </div>
        <div class="space-y-2">
          <Label>Téléphone (Optionnel)</Label>
          <Input name="phone" type="tel" bind:value={$createForm.phone} />
        </div>
      </div>

      <div class="space-y-2">
        <Label>Niveau</Label>
        <Select.Root
          type="single"
          name="niveau"
          bind:value={$createForm.niveau}
        >
          <Select.Trigger>{$createForm.niveau || 'Sélectionner'}</Select.Trigger
          >
          <Select.Content>
            {#each niveauxScolaires as nv}
              <Select.Item value={nv}>{nv}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <input type="hidden" name="niveau" value={$createForm.niveau} />
      </div>
      <Dialog.Footer
        ><Button type="submit">Créer et Inscrire</Button></Dialog.Footer
      >
    </form>
  </Dialog.Content>
</Dialog.Root>
