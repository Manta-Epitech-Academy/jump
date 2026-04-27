<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { LoaderCircle } from '@lucide/svelte';
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
  <Dialog.Content class="rounded-sm sm:max-w-125">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight uppercase"
        >{isEditing ? 'Modifier' : 'Ajouter'} un Talent</Dialog.Title
      >
      <Dialog.Description class="text-xs font-medium">
        {isEditing
          ? 'Mettez à jour les informations du profil CRM.'
          : "Créez le profil d'un nouveau Talent."}
      </Dialog.Description>
    </Dialog.Header>

    <form method="POST" {action} use:enhance class="grid gap-5 py-2">
      {#if isEditing}
        <input type="hidden" name="id" value={editId} />
      {/if}

      <!-- GROUP 1: Identity -->
      <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
        <h4
          class="border-b border-border/50 pb-2 font-sans text-sm font-bold tracking-wide text-foreground uppercase"
        >
          Identité
        </h4>
        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label for="nom" class="text-xs">Nom</Label>
            <Input
              id="nom"
              name="nom"
              bind:value={$form.nom}
              placeholder="Dupont"
              class="rounded-sm bg-background"
            />
            {#if $errors.nom}<span class="text-xs text-destructive"
                >{$errors.nom}</span
              >{/if}
          </div>
          <div class="grid gap-2">
            <Label for="prenom" class="text-xs">Prénom</Label>
            <Input
              id="prenom"
              name="prenom"
              bind:value={$form.prenom}
              placeholder="Jean"
              class="rounded-sm bg-background"
            />
            {#if $errors.prenom}<span class="text-xs text-destructive"
                >{$errors.prenom}</span
              >{/if}
          </div>
        </div>
      </div>

      <!-- GROUP 2: Contact -->
      <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
        <h4
          class="border-b border-border/50 pb-2 font-sans text-sm font-bold tracking-wide text-foreground uppercase"
        >
          Contact Direct & Parents
        </h4>
        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label for="email" class="text-xs"
              >Email <span class="font-normal text-muted-foreground"
                >(optionnel)</span
              ></Label
            >
            <Input
              id="email"
              name="email"
              type="email"
              bind:value={$form.email}
              placeholder="email@example.com"
              class="rounded-sm bg-background"
            />
            {#if $errors.email}<span class="text-xs text-destructive"
                >{$errors.email}</span
              >{/if}
          </div>
          <div class="grid gap-2">
            <Label for="phone" class="text-xs"
              >Téléphone <span class="font-normal text-muted-foreground"
                >(optionnel)</span
              ></Label
            >
            <Input
              id="phone"
              name="phone"
              type="tel"
              bind:value={$form.phone}
              placeholder="06..."
              class="rounded-sm bg-background"
            />
            {#if $errors.phone}<span class="text-xs text-destructive"
                >{$errors.phone}</span
              >{/if}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label for="parent_email" class="text-xs"
              >Email Parent <span class="font-normal text-muted-foreground"
                >(optionnel)</span
              ></Label
            >
            <Input
              id="parent_email"
              name="parent_email"
              type="email"
              bind:value={$form.parent_email}
              placeholder="parent@example.com"
              class="rounded-sm bg-background"
            />
            {#if $errors.parent_email}<span class="text-xs text-destructive"
                >{$errors.parent_email}</span
              >{/if}
          </div>
          <div class="grid gap-2">
            <Label for="parent_phone" class="text-xs"
              >Tél. Parent <span class="font-normal text-muted-foreground"
                >(optionnel)</span
              ></Label
            >
            <Input
              id="parent_phone"
              name="parent_phone"
              type="tel"
              bind:value={$form.parent_phone}
              placeholder="06..."
              class="rounded-sm bg-background"
            />
            {#if $errors.parent_phone}<span class="text-xs text-destructive"
                >{$errors.parent_phone}</span
              >{/if}
          </div>
        </div>
      </div>

      <!-- GROUP 3: Academic -->
      <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
        <h4
          class="border-b border-border/50 pb-2 font-sans text-sm font-bold tracking-wide text-foreground uppercase"
        >
          Profil Pédagogique
        </h4>
        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label for="niveau" class="text-xs">Niveau Scolaire</Label>
            <Select.Root type="single" bind:value={$form.niveau}>
              <Select.Trigger class="rounded-sm bg-background">
                {$form.niveau ? $form.niveau : 'Sélectionner...'}
              </Select.Trigger>
              <Select.Content class="rounded-sm">
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
            <Label for="niveau_difficulte" class="text-xs"
              >Niveau Informatique</Label
            >
            <Select.Root type="single" bind:value={$form.niveau_difficulte}>
              <Select.Trigger class="rounded-sm bg-background">
                {$form.niveau_difficulte ? $form.niveau_difficulte : 'Débutant'}
              </Select.Trigger>
              <Select.Content class="rounded-sm">
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
            {#if $errors.niveau_difficulte}<span
                class="text-xs text-destructive"
                >{$errors.niveau_difficulte}</span
              >{/if}
          </div>
        </div>
      </div>

      <Dialog.Footer class="border-t pt-4">
        <Button
          type="submit"
          disabled={$delayed}
          class="w-full rounded-sm bg-epi-blue font-bold text-white shadow-sm hover:bg-epi-blue/90 dark:shadow-none"
        >
          {#if $delayed}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
            Enregistrement...
          {:else}
            {isEditing ? 'Mettre à jour' : 'Créer le Talent'}
          {/if}
        </Button>
      </Dialog.Footer>
    </form>

    {@render children?.()}
  </Dialog.Content>
</Dialog.Root>
