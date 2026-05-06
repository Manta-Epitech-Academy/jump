<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Heart from '@lucide/svelte/icons/heart';
  import FolderHeart from '@lucide/svelte/icons/folder-heart';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';

  let { data } = $props();

  // Category form
  const {
    form: catForm,
    errors: catErrors,
    enhance: catEnhance,
    delayed: catDelayed,
    reset: catReset,
  } = superForm(
    untrack(() => data.categoryForm),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          categoryDialogOpen = false;
          toast.success(result.data?.form?.message || 'Action réussie');
        }
      },
    },
  );

  // Interest form
  const {
    form: intForm,
    errors: intErrors,
    enhance: intEnhance,
    delayed: intDelayed,
    reset: intReset,
  } = superForm(
    untrack(() => data.interestForm),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          interestDialogOpen = false;
          toast.success(result.data?.form?.message || 'Action réussie');
        }
      },
    },
  );

  // Category dialog state
  let categoryDialogOpen = $state(false);
  let isCatEditing = $state(false);
  let catEditId = $state('');

  // Interest dialog state
  let interestDialogOpen = $state(false);
  let isIntEditing = $state(false);
  let intEditId = $state('');

  // Delete dialog state
  let deleteDialogOpen = $state(false);
  let deleteAction = $state('');
  let deleteTitle = $state('');
  let deleteDescription = $state('');

  function openCreateCategory() {
    catReset();
    isCatEditing = false;
    catEditId = '';
    categoryDialogOpen = true;
  }

  function openEditCategory(category: { id: string; nom: string }) {
    catReset();
    $catForm.nom = category.nom;
    isCatEditing = true;
    catEditId = category.id;
    categoryDialogOpen = true;
  }

  function openCreateInterest(categoryId: string) {
    intReset();
    $intForm.categoryId = categoryId;
    isIntEditing = false;
    intEditId = '';
    interestDialogOpen = true;
  }

  function openEditInterest(interest: {
    id: string;
    nom: string;
    emoji: string | null;
    categoryId: string;
  }) {
    intReset();
    $intForm.nom = interest.nom;
    $intForm.emoji = interest.emoji ?? '';
    $intForm.categoryId = interest.categoryId;
    isIntEditing = true;
    intEditId = interest.id;
    interestDialogOpen = true;
  }

  function confirmDeleteCategory(id: string) {
    deleteAction = `?/deleteCategory&id=${id}`;
    deleteTitle = 'Supprimer la catégorie';
    deleteDescription =
      'Tous les intérêts de cette catégorie seront également supprimés. Cette action est irréversible.';
    deleteDialogOpen = true;
  }

  function confirmDeleteInterest(id: string) {
    deleteAction = `?/deleteInterest&id=${id}`;
    deleteTitle = "Supprimer l'intérêt";
    deleteDescription = 'Cette action est irréversible.';
    deleteDialogOpen = true;
  }
</script>

<svelte:head>
  <title>Centres d'intérêt</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Centres d'<span class="text-epi-pink">intérêt</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Catégories et intérêts proposés aux talents pendant l'onboarding.
      </p>
    </div>
    <Button
      onclick={openCreateCategory}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" /> Nouvelle catégorie
    </Button>
  </div>

  {#if data.categories.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-sm border bg-card py-16 text-center shadow-sm"
    >
      <FolderHeart class="mb-4 h-12 w-12 text-muted-foreground/40" />
      <p class="text-lg font-bold text-muted-foreground">Aucune catégorie</p>
      <p class="mt-1 text-sm text-muted-foreground/70">
        Créez une première catégorie pour organiser les intérêts.
      </p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each data.categories as category}
        <div class="rounded-sm border bg-card shadow-sm">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <div class="flex items-center gap-3">
              <Heart class="h-4 w-4 text-epi-pink" />
              <span
                class="font-heading text-lg font-bold tracking-wide uppercase"
              >
                {category.nom}
              </span>
              <span
                class="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground"
              >
                {category._count.interests} intérêt{category._count
                  .interests !== 1
                  ? 's'
                  : ''}
              </span>
            </div>
            <div class="flex items-center gap-1">
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="ghost"
                        size="sm"
                        class="text-epi-pink hover:bg-epi-pink/10"
                        onclick={() => openCreateInterest(category.id)}
                      >
                        <Plus class="mr-1 h-3.5 w-3.5" /> Intérêt
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content><p>Ajouter un intérêt</p></Tooltip.Content>
                </Tooltip.Root>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="ghost"
                        size="icon"
                        onclick={() => openEditCategory(category)}
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
                        class="text-destructive hover:bg-destructive/10"
                        onclick={() => confirmDeleteCategory(category.id)}
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content><p>Supprimer</p></Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 p-4">
            {#if category.interests.length === 0}
              <p class="text-sm text-muted-foreground/60 italic">
                Aucun intérêt dans cette catégorie.
              </p>
            {:else}
              {#each category.interests as interest}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  role="button"
                  tabindex="0"
                  class="group relative flex cursor-pointer items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:border-epi-pink/50 hover:bg-epi-pink/5"
                  onclick={() => openEditInterest(interest)}
                  onkeydown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ')
                      openEditInterest(interest);
                  }}
                >
                  {#if interest.emoji}
                    <span>{interest.emoji}</span>
                  {/if}
                  <span>{interest.nom}</span>
                  <span
                    class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                  >
                    {interest._count.talentInterests}
                  </span>
                  <button
                    type="button"
                    class="ml-1 hidden rounded-full p-0.5 text-destructive transition-colors group-hover:inline-flex hover:bg-destructive/10"
                    onclick={(e: MouseEvent) => {
                      e.stopPropagation();
                      confirmDeleteInterest(interest.id);
                    }}
                  >
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Category Dialog -->
  <Dialog.Root bind:open={categoryDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>
          {isCatEditing ? 'Modifier' : 'Nouvelle'} catégorie
        </Dialog.Title>
      </Dialog.Header>
      <form
        method="POST"
        action={isCatEditing ? '?/updateCategory' : '?/createCategory'}
        use:catEnhance
        class="space-y-4 py-4"
      >
        {#if isCatEditing}<input
            type="hidden"
            name="id"
            value={catEditId}
          />{/if}
        <div class="space-y-2">
          <Label>Nom de la catégorie</Label>
          <Input
            name="nom"
            bind:value={$catForm.nom}
            placeholder="Ex: Sport, Musique..."
          />
          {#if $catErrors.nom}<span class="text-xs text-destructive"
              >{$catErrors.nom}</span
            >{/if}
        </div>
        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$catDelayed}
            class="bg-epi-pink text-white"
          >
            {$catDelayed ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <!-- Interest Dialog -->
  <Dialog.Root bind:open={interestDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>
          {isIntEditing ? 'Modifier' : 'Nouvel'} intérêt
        </Dialog.Title>
      </Dialog.Header>
      <form
        method="POST"
        action={isIntEditing ? '?/updateInterest' : '?/createInterest'}
        use:intEnhance
        class="space-y-4 py-4"
      >
        {#if isIntEditing}<input
            type="hidden"
            name="id"
            value={intEditId}
          />{/if}
        <input type="hidden" name="categoryId" value={$intForm.categoryId} />
        <div class="space-y-2">
          <Label>Nom</Label>
          <Input
            name="nom"
            bind:value={$intForm.nom}
            placeholder="Ex: Football, Piano..."
          />
          {#if $intErrors.nom}<span class="text-xs text-destructive"
              >{$intErrors.nom}</span
            >{/if}
        </div>
        <div class="space-y-2">
          <Label>Emoji (optionnel)</Label>
          <Input
            name="emoji"
            bind:value={$intForm.emoji}
            placeholder="Ex: &#9917;"
            class="w-24"
          />
        </div>
        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$intDelayed}
            class="bg-epi-pink text-white"
          >
            {$intDelayed ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <!-- Delete Confirm Dialog -->
  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action={deleteAction}
    title={deleteTitle}
    description={deleteDescription}
  />
</div>
