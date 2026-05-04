<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    Plus,
    Pencil,
    Trash2,
    CalendarDays,
    ArrowRight,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { toast } from 'svelte-sonner';
  import { resolve } from '$app/paths';

  let { data } = $props();

  const { form, errors, enhance, delayed, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message);
        }
      },
    },
  );

  let open = $state(false);
  let isEditing = $state(false);
  let editId = $state('');

  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  function openCreate() {
    reset();
    $form.nbDays = 1;
    $form.description = '';
    isEditing = false;
    editId = '';
    open = true;
  }

  function openEdit(template: (typeof data.templates)[number]) {
    reset();
    $form.nom = template.nom;
    $form.description = template.description || '';
    $form.nbDays = template.nbDays;
    isEditing = true;
    editId = template.id;
    open = true;
  }

  function confirmDelete(id: string) {
    itemToDelete = id;
    deleteDialogOpen = true;
  }
</script>

<svelte:head>
  <title>Modèles de planning</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Modèles de <span class="text-epi-pink">Planning</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Grilles de planning réutilisables pour tous les campus
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" /> Nouveau Modèle
    </Button>
  </div>

  {#if data.templates.length === 0}
    <EmptyState
      icon={CalendarDays}
      title="Aucun modèle de planning"
      description="Créez un modèle pour standardiser la planification des événements sur tous les campus."
      actionLabel="Nouveau Modèle"
      actionCallback={openCreate}
    />
  {:else}
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Modèle</Table.Head>
            <Table.Head>Jours</Table.Head>
            <Table.Head>Créneaux</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.templates as template}
            <Table.Row>
              <Table.Cell>
                <div class="font-bold">{template.nom}</div>
                <div
                  class="line-clamp-1 max-w-sm text-xs text-muted-foreground"
                >
                  {template.description || ''}
                </div>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="outline" class="text-[10px] uppercase">
                  {template.nbDays} jour{template.nbDays > 1 ? 's' : ''}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <span class="text-sm text-muted-foreground">
                  {template.totalSlots} créneau{template.totalSlots > 1
                    ? 'x'
                    : ''}
                </span>
              </Table.Cell>
              <Table.Cell class="text-right">
                <Tooltip.Provider delayDuration={300}>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          href={resolve(
                            `/staff/admin/planning-templates/${template.id}`,
                          )}
                          class="text-epi-pink"
                        >
                          <ArrowRight class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Configurer</p></Tooltip.Content>
                  </Tooltip.Root>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          onclick={() => openEdit(template)}
                        >
                          <Pencil class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Modifier</p></Tooltip.Content>
                  </Tooltip.Root>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          class="text-destructive hover:text-destructive"
                          onclick={() => confirmDelete(template.id)}
                        >
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Supprimer</p></Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}

  <!-- Create/Edit Dialog -->
  <Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>
          {isEditing ? 'Modifier le modèle' : 'Nouveau modèle de planning'}
        </Dialog.Title>
      </Dialog.Header>
      <form
        method="POST"
        action={isEditing ? '?/update' : '?/create'}
        use:enhance
        class="grid gap-4 py-4"
      >
        {#if isEditing}
          <input type="hidden" name="id" value={editId} />
        {/if}

        <div class="grid gap-2">
          <Label>Nom</Label>
          <Input
            name="nom"
            bind:value={$form.nom}
            placeholder="Stage de Seconde 2026"
          />
          {#if $errors.nom}
            <span class="text-xs text-destructive">{$errors.nom}</span>
          {/if}
        </div>

        <div class="grid gap-2">
          <Label>Nombre de jours</Label>
          <Input
            type="number"
            name="nbDays"
            bind:value={$form.nbDays}
            min="1"
            max="30"
          />
          {#if $errors.nbDays}
            <span class="text-xs text-destructive">{$errors.nbDays}</span>
          {/if}
        </div>

        <div class="grid gap-2">
          <Label>Description</Label>
          <Textarea
            name="description"
            bind:value={$form.description}
            class="h-20"
            placeholder="Planning type pour le stage de seconde..."
          />
          {#if $errors.description}
            <span class="text-xs text-destructive">{$errors.description}</span>
          {/if}
        </div>

        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$delayed}
            class="bg-epi-pink text-white"
          >
            {$delayed ? 'Traitement...' : isEditing ? 'Mettre à jour' : 'Créer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title="Supprimer ce modèle de planning ?"
    description="Cette action supprimera définitivement le modèle et tous ses créneaux configurés."
  />
</div>
