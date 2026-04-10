<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    Plus,
    Pencil,
    Trash2,
    BookOpen,
    ExternalLink,
    Globe,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import MultiThemeSelect from '$lib/components/MultiThemeSelect.svelte';
  import { toast } from 'svelte-sonner';
  import { difficultes } from '$lib/validation/subjects';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { getSubjectXpValue } from '$lib/domain/xp';

  let { data } = $props();

  // Form handling and server response toasts
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

  // Dialog visibility variables
  let open = $state(false);
  let isEditing = $state(false);
  let editId = $state('');

  // Delete confirmation states
  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  // Reset form with default values for a new entry
  function openCreate() {
    reset();
    $form.difficulte = 'Débutant';
    $form.themes = [];
    isEditing = false;
    editId = '';
    open = true;
  }

  // Populate form with existing data when editing
  function openEdit(subject: any) {
    reset();
    $form.nom = subject.nom;
    $form.description = subject.description;
    $form.difficulte = subject.difficulte;
    $form.link = subject.link || '';
    $form.themes = subject.subjectThemes?.map((st: any) => st.theme.nom) || [];
    isEditing = true;
    editId = subject.id;
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
        Sujets <span class="text-epi-pink">Officiels</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Base de connaissances distribuée à tous les campus
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" /> Nouveau Sujet Global
    </Button>
  </div>

  <div class="rounded-sm border bg-card shadow-sm">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-12 text-center"
            ><Globe class="mx-auto h-4 w-4 text-epi-pink" /></Table.Head
          >
          <Table.Head>Sujet</Table.Head>
          <Table.Head>Thèmes</Table.Head>
          <Table.Head>Niveau / XP</Table.Head>
          <Table.Head class="text-right">Actions</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.subjects as subject}
          <Table.Row>
            <Table.Cell class="text-center"
              ><BookOpen
                class="mx-auto h-4 w-4 text-muted-foreground"
              /></Table.Cell
            >
            <Table.Cell>
              <div class="font-bold">
                {#if subject.link}
                  <a
                    href={subject.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="transition-colors hover:text-epi-pink hover:underline"
                  >
                    {subject.nom}
                  </a>
                {:else}
                  {subject.nom}
                {/if}
              </div>
              <div class="line-clamp-1 max-w-sm text-xs text-muted-foreground">
                {subject.description}
              </div>
            </Table.Cell>
            <Table.Cell>
              <div class="flex flex-wrap gap-1">
                {#each subject.subjectThemes || [] as st}
                  <Badge variant="secondary" class="text-[10px]"
                    >#{st.theme.nom}</Badge
                  >
                {/each}
              </div>
            </Table.Cell>
            <Table.Cell>
              <Badge variant="outline" class="text-[10px] uppercase"
                >{subject.difficulte}</Badge
              >
              <span class="ml-2 text-xs font-bold text-muted-foreground"
                >{getSubjectXpValue(subject.difficulte)} XP</span
              >
            </Table.Cell>
            <Table.Cell class="text-right">
              <Tooltip.Provider delayDuration={300}>
                {#if subject.link}
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          href={subject.link}
                          target="_blank"
                          class="text-epi-blue"
                        >
                          <ExternalLink class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Voir le support</p></Tooltip.Content>
                  </Tooltip.Root>
                {/if}
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="ghost"
                        size="icon"
                        onclick={() => openEdit(subject)}
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
                        onclick={() => confirmDelete(subject.id)}
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

  <Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-xl">
      <Dialog.Header>
        <Dialog.Title
          >{isEditing
            ? 'Modifier le sujet'
            : 'Créer un sujet OFFICIEL'}</Dialog.Title
        >
      </Dialog.Header>
      <form
        method="POST"
        action={isEditing ? '?/update' : '?/create'}
        use:enhance
        class="grid gap-4 py-4"
      >
        {#if isEditing}<input type="hidden" name="id" value={editId} />{/if}
        <div class="grid gap-2">
          <Label>Nom</Label>
          <Input name="nom" bind:value={$form.nom} />
          {#if $errors.nom}<span class="text-xs text-destructive"
              >{$errors.nom}</span
            >{/if}
        </div>
        <div class="grid gap-2">
          <Label>Support (Lien URL)</Label>
          <Input name="link" bind:value={$form.link} />
          {#if $errors.link}<span class="text-xs text-destructive"
              >{$errors.link}</span
            >{/if}
        </div>
        <div class="grid gap-2">
          <Label>Thèmes Officiels</Label>
          <MultiThemeSelect
            themes={data.themes}
            bind:value={$form.themes}
            officialOnly
          />
        </div>
        <div class="grid gap-2">
          <Label>Difficulté</Label>
          <div class="flex gap-2">
            {#each difficultes as diff}
              <Button
                type="button"
                variant={$form.difficulte === diff ? 'default' : 'outline'}
                size="sm"
                onclick={() => ($form.difficulte = diff)}
                class={$form.difficulte === diff ? 'bg-epi-pink' : ''}
              >
                {diff}
              </Button>
            {/each}
            <input type="hidden" name="difficulte" value={$form.difficulte} />
          </div>
        </div>
        <div class="grid gap-2">
          <Label>Description</Label>
          <Textarea
            name="description"
            bind:value={$form.description}
            class="h-24"
          />
        </div>
        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$delayed}
            class="bg-epi-pink text-white"
          >
            {$delayed
              ? 'Traitement...'
              : isEditing
                ? 'Mettre à jour'
                : 'Publier'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title="Supprimer un sujet officiel ?"
    description="Cela le supprimera des bibliothèques de TOUS les campus."
  />
</div>
