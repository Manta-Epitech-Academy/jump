<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { difficultes } from '$lib/domain/xp';
  import type { StudentForm } from '$lib/validation/students';
  import type { Snippet } from 'svelte';
  import type { SuperForm, Infer } from 'sveltekit-superforms';
  import type { studentSchema } from '$lib/validation/students';

  type StudentSuperForm = SuperForm<Infer<typeof studentSchema>>;

  let {
    open = $bindable(false),
    isEditing,
    editId,
    form,
    errors,
    delayed,
    enhance,
    action,
    children,
  }: {
    open: boolean;
    isEditing: boolean;
    editId: string;
    form: StudentSuperForm['form'];
    errors: StudentSuperForm['errors'];
    delayed: StudentSuperForm['delayed'];
    enhance: StudentSuperForm['enhance'];
    action: string;
    children?: Snippet;
  } = $props();

  const niveaux = [
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
  <Dialog.Content class="sm:max-w-125">
    <Dialog.Header>
      <Dialog.Title>{isEditing ? 'Modifier' : 'Ajouter'} un élève</Dialog.Title>
      <Dialog.Description>
        {isEditing
          ? 'Mettez à jour les informations du profil.'
          : "Créez le profil d'un nouvel étudiant."}
      </Dialog.Description>
    </Dialog.Header>

    <form method="POST" {action} use:enhance class="grid gap-4 py-4">
      {#if isEditing}
        <input type="hidden" name="id" value={editId} />
      {/if}

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="nom">Nom</Label>
          <Input
            id="nom"
            name="nom"
            bind:value={$form.nom}
            placeholder="Dupont"
          />
          {#if $errors.nom}<span class="text-xs text-destructive"
              >{$errors.nom}</span
            >{/if}
        </div>
        <div class="grid gap-2">
          <Label for="prenom">Prénom</Label>
          <Input
            id="prenom"
            name="prenom"
            bind:value={$form.prenom}
            placeholder="Jean"
          />
          {#if $errors.prenom}<span class="text-xs text-destructive"
              >{$errors.prenom}</span
            >{/if}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="email">Email (Optionnel)</Label>
          <Input
            id="email"
            name="email"
            type="email"
            bind:value={$form.email}
            placeholder="email@example.com"
          />
          {#if $errors.email}<span class="text-xs text-destructive"
              >{$errors.email}</span
            >{/if}
        </div>
        <div class="grid gap-2">
          <Label for="phone">Téléphone (Optionnel)</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            bind:value={$form.phone}
            placeholder="06..."
          />
          {#if $errors.phone}<span class="text-xs text-destructive"
              >{$errors.phone}</span
            >{/if}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="parent_email">Email Parent (Optionnel)</Label>
          <Input
            id="parent_email"
            name="parent_email"
            type="email"
            bind:value={$form.parent_email}
            placeholder="parent@example.com"
          />
          {#if $errors.parent_email}<span class="text-xs text-destructive"
              >{$errors.parent_email}</span
            >{/if}
        </div>
        <div class="grid gap-2">
          <Label for="parent_phone">Téléphone Parent (Optionnel)</Label>
          <Input
            id="parent_phone"
            name="parent_phone"
            type="tel"
            bind:value={$form.parent_phone}
            placeholder="06..."
          />
          {#if $errors.parent_phone}<span class="text-xs text-destructive"
              >{$errors.parent_phone}</span
            >{/if}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="niveau">Niveau Scolaire</Label>
          <Select.Root type="single" bind:value={$form.niveau}>
            <Select.Trigger>
              {$form.niveau ? $form.niveau : 'Sélectionner...'}
            </Select.Trigger>
            <Select.Content>
              {#each niveaux as niveau}
                <Select.Item value={niveau}>{niveau}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <input type="hidden" name="niveau" value={$form.niveau} />
          {#if $errors.niveau}<span class="text-xs text-destructive"
              >{$errors.niveau}</span
            >{/if}
        </div>

        <div class="grid gap-2">
          <Label for="niveau_difficulte">Difficulté</Label>
          <Select.Root type="single" bind:value={$form.niveau_difficulte}>
            <Select.Trigger>
              {$form.niveau_difficulte ? $form.niveau_difficulte : 'Débutant'}
            </Select.Trigger>
            <Select.Content>
              {#each difficultes as diff}
                <Select.Item value={diff}>{diff}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <input
            type="hidden"
            name="niveau_difficulte"
            value={$form.niveau_difficulte}
          />
          {#if $errors.niveau_difficulte}<span class="text-xs text-destructive"
              >{$errors.niveau_difficulte}</span
            >{/if}
        </div>
      </div>

      <Dialog.Footer>
        <Button type="submit" disabled={$delayed} class="w-full">
          {#if $delayed}Enregistrement...{:else}{isEditing
              ? 'Mettre à jour'
              : "Créer l'élève"}{/if}
        </Button>
      </Dialog.Footer>
    </form>

    {@render children?.()}
  </Dialog.Content>
</Dialog.Root>
