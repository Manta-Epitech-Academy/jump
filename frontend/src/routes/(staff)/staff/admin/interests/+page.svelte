<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Heart from '@lucide/svelte/icons/heart';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';

  let { data } = $props();

  const { form, enhance, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          dialogOpen = false;
          toast.success(result.data?.form?.message || 'Action réussie');
        }
      },
    },
  );

  let dialogOpen = $state(false);
  let isEditing = $state(false);
  let editId = $state('');
  let deleteDialogOpen = $state(false);
  let deleteId = $state<string | null>(null);

  function openCreate() {
    reset();
    isEditing = false;
    editId = '';
    dialogOpen = true;
  }

  function openEdit(interest: any) {
    reset();
    $form.nom = interest.nom;
    $form.emoji = interest.emoji ?? '';
    isEditing = true;
    editId = interest.id;
    dialogOpen = true;
  }
</script>

<svelte:head>
  <title>Centres d'intérêt — Admin</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Centres d'<span class="text-epi-pink">intérêt</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Intérêts proposés aux talents pendant l'onboarding.
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" />
      Ajouter
    </Button>
  </div>

  {#if data.interests.length === 0}
    <div
      class="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center"
    >
      <Heart class="h-10 w-10 text-muted-foreground/40" />
      <p class="text-sm text-muted-foreground">Aucun centre d'intérêt créé.</p>
    </div>
  {:else}
    <div class="flex flex-wrap gap-2">
      {#each data.interests as interest (interest.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          role="button"
          tabindex="0"
          class="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          onclick={() => openEdit(interest)}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') openEdit(interest);
          }}
        >
          {#if interest.emoji}<span>{interest.emoji}</span>{/if}
          <span>{interest.nom}</span>
          <span class="ml-1 text-[10px] text-muted-foreground">
            ({interest._count.talentInterests})
          </span>
          <button
            type="button"
            class="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            onclick={(e: MouseEvent) => {
              e.stopPropagation();
              deleteId = interest.id;
              deleteDialogOpen = true;
            }}
          >
            <Trash2 class="h-3 w-3 text-destructive" />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>
        {isEditing ? "Modifier l'intérêt" : 'Nouvel intérêt'}
      </Dialog.Title>
    </Dialog.Header>
    <form
      method="POST"
      action={isEditing ? '?/update' : '?/create'}
      use:enhance
    >
      {#if isEditing}
        <input type="hidden" name="id" value={editId} />
      {/if}
      <div class="space-y-4 py-4">
        <div>
          <Label for="int-nom">Nom</Label>
          <Input id="int-nom" name="nom" bind:value={$form.nom} />
        </div>
        <div>
          <Label for="int-emoji">Emoji (optionnel)</Label>
          <Input
            id="int-emoji"
            name="emoji"
            bind:value={$form.emoji}
            placeholder="ex: &#9917;"
          />
        </div>
      </div>
      <Dialog.Footer>
        <Button type="submit">{isEditing ? 'Enregistrer' : 'Créer'}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<ConfirmDeleteDialog
  bind:open={deleteDialogOpen}
  title="Supprimer l'intérêt"
  description="Cet intérêt sera retiré de tous les talents."
  action={`?/delete&id=${deleteId}`}
  onSuccess={() => {
    deleteDialogOpen = false;
    toast.success('Supprimé.');
  }}
/>
