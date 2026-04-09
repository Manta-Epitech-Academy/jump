<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { Plus, Pencil, Trash2, Map } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { m } from '$lib/paraglide/messages.js';

  let { data } = $props();

  // Form handling logic
  const { form, errors, enhance, delayed, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message ?? m.common_action_success());
        }
      },
    },
  );

  // Dialog and edit state variables
  let open = $state(false);
  let isEditing = $state(false);
  let editId = $state('');

  // Deletion confirmation state
  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  function openCreate() {
    reset();
    isEditing = false;
    editId = '';
    open = true;
  }

  function openEdit(campus: any) {
    reset();
    $form.name = campus.name;
    isEditing = true;
    editId = campus.id;
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
        {m.admin_campuses_title()} <span class="text-epi-pink">{m.admin_campuses_title_accent()}</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        {m.admin_campuses_subtitle()}
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" /> {m.common_add()}
    </Button>
  </div>

  <div class="rounded-sm border bg-card shadow-sm">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-12"></Table.Head>
          <Table.Head>{m.admin_campuses_col_name()}</Table.Head>
          <Table.Head class="text-right">{m.common_actions()}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.campuses as campus}
          <Table.Row>
            <Table.Cell
              ><Map class="h-4 w-4 text-muted-foreground" /></Table.Cell
            >
            <Table.Cell class="font-bold">{campus.name}</Table.Cell>
            <Table.Cell class="text-right">
              <Button
                variant="ghost"
                size="icon"
                onclick={() => openEdit(campus)}
              >
                <Pencil class="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="text-destructive hover:text-destructive"
                onclick={() => confirmDelete(campus.id)}
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
        <Dialog.Title>{isEditing ? m.admin_campuses_form_edit_title() : m.admin_campuses_form_create_title()}</Dialog.Title>
      </Dialog.Header>
      <form
        method="POST"
        action={isEditing ? '?/update' : '?/create'}
        use:enhance
        class="space-y-4 py-4"
      >
        {#if isEditing}<input type="hidden" name="id" value={editId} />{/if}
        <div class="space-y-2">
          <Label>{m.admin_campuses_form_label()}</Label>
          <Input name="name" bind:value={$form.name} placeholder="Ex: Paris" />
          {#if $errors.name}<span class="text-xs text-destructive"
              >{$errors.name}</span
            >{/if}
        </div>
        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$delayed}
            class="bg-epi-pink text-white"
          >
            {$delayed ? m.common_saving() : m.common_save()}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title={m.admin_campuses_delete_title()}
    description={m.admin_campuses_delete_description()}
  />
</div>
