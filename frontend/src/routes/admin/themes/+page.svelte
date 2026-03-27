<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { Plus, Pencil, Trash2, Tags, Globe } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';

  let { data } = $props();

  // Form handling and state update upon completion
  const { form, errors, enhance, delayed, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message || 'Action réussie');
        }
      },
    },
  );

  // Dialog status and mode configuration
  let open = $state(false);
  let isEditing = $state(false);
  let editId = $state('');

  // Theme deletion status
  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  function openCreate() {
    reset();
    isEditing = false;
    editId = '';
    open = true;
  }

  function openEdit(theme: any) {
    reset();
    $form.nom = theme.nom;
    isEditing = true;
    editId = theme.id;
    open = true;
  }

  function confirmDelete(id: string) {
    itemToDelete = id;
    deleteDialogOpen = true;
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Thèmes <span class="text-epi-pink">Officiels</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Catégories globales pour les sujets
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" /> Ajouter
    </Button>
  </div>

  <div class="rounded-sm border bg-card shadow-sm">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-12 text-center"
            ><Globe class="mx-auto h-4 w-4 text-epi-pink" /></Table.Head
          >
          <Table.Head>Nom du Thème</Table.Head>
          <Table.Head class="text-right">Actions</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.themes as theme}
          <Table.Row>
            <Table.Cell class="text-center"
              ><Tags
                class="mx-auto h-4 w-4 text-muted-foreground"
              /></Table.Cell
            >
            <Table.Cell class="font-bold">#{theme.nom}</Table.Cell>
            <Table.Cell class="text-right">
              <Button
                variant="ghost"
                size="icon"
                onclick={() => openEdit(theme)}
              >
                <Pencil class="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="text-destructive hover:bg-destructive/10"
                onclick={() => confirmDelete(theme.id)}
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  <Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title
          >{isEditing ? 'Modifier' : 'Nouveau'} Thème Officiel</Dialog.Title
        >
      </Dialog.Header>
      <form
        method="POST"
        action={isEditing ? '?/update' : '?/create'}
        use:enhance
        class="space-y-4 py-4"
      >
        {#if isEditing}<input type="hidden" name="id" value={editId} />{/if}
        <div class="space-y-2">
          <Label>Nom du Thème</Label>
          <Input
            name="nom"
            bind:value={$form.nom}
            placeholder="Ex: Python, Cybersécurité..."
          />
          {#if $errors.nom}<span class="text-xs text-destructive"
              >{$errors.nom}</span
            >{/if}
        </div>
        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$delayed}
            class="bg-epi-pink text-white"
          >
            {$delayed ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title="Supprimer le thème"
    description="Êtes-vous sûr ? Impossible s'il est utilisé par un ou plusieurs sujets."
  />
</div>
