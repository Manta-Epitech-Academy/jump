<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Code from '@lucide/svelte/icons/code';
  import Sparkles from '@lucide/svelte/icons/sparkles';
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

  function openCreate(kind: 'tech' | 'general') {
    reset();
    $form.kind = kind;
    isEditing = false;
    editId = '';
    dialogOpen = true;
  }

  function openEdit(interest: any) {
    reset();
    $form.nom = interest.nom;
    $form.emoji = interest.emoji ?? '';
    $form.kind = interest.kind;
    isEditing = true;
    editId = interest.id;
    dialogOpen = true;
  }
</script>

<svelte:head>
  <title>Centres d'intérêt — Admin</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Centres d'<span class="text-epi-pink">intérêt</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Intérêts proposés aux talents pendant l'onboarding.
    </p>
  </div>

  <!-- Tech interests -->
  <div class="rounded-lg border bg-card">
    <div class="flex items-center justify-between border-b px-4 py-3">
      <div class="flex items-center gap-2">
        <Code class="h-4 w-4 text-epi-blue" />
        <h2 class="text-sm font-bold tracking-wide uppercase">
          Informatique
          <span class="ml-1 text-xs font-normal text-muted-foreground">
            ({data.techInterests.length})
          </span>
        </h2>
      </div>
      <Button variant="ghost" size="sm" onclick={() => openCreate('tech')}>
        <Plus class="mr-1 h-3.5 w-3.5" />
        Ajouter
      </Button>
    </div>
    <div class="flex flex-wrap gap-2 p-4">
      {#each data.techInterests as interest (interest.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          role="button"
          tabindex="0"
          class="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          onclick={(e: MouseEvent) => {
            if (
              e.target !== e.currentTarget &&
              (e.target as HTMLElement).closest('button')
            )
              return;
            openEdit(interest);
          }}
          onkeydown={(e: KeyboardEvent) => {
            if (e.target !== e.currentTarget) return;
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
      {#if data.techInterests.length === 0}
        <p class="text-xs text-muted-foreground italic">Aucun intérêt tech.</p>
      {/if}
    </div>
  </div>

  <!-- General interests -->
  <div class="rounded-lg border bg-card">
    <div class="flex items-center justify-between border-b px-4 py-3">
      <div class="flex items-center gap-2">
        <Sparkles class="h-4 w-4 text-epi-teal" />
        <h2 class="text-sm font-bold tracking-wide uppercase">
          Centres d'intérêt généraux
          <span class="ml-1 text-xs font-normal text-muted-foreground">
            ({data.generalInterests.length})
          </span>
        </h2>
      </div>
      <Button variant="ghost" size="sm" onclick={() => openCreate('general')}>
        <Plus class="mr-1 h-3.5 w-3.5" />
        Ajouter
      </Button>
    </div>
    <div class="flex flex-wrap gap-2 p-4">
      {#each data.generalInterests as interest (interest.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          role="button"
          tabindex="0"
          class="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          onclick={(e: MouseEvent) => {
            if (
              e.target !== e.currentTarget &&
              (e.target as HTMLElement).closest('button')
            )
              return;
            openEdit(interest);
          }}
          onkeydown={(e: KeyboardEvent) => {
            if (e.target !== e.currentTarget) return;
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
      {#if data.generalInterests.length === 0}
        <p class="text-xs text-muted-foreground italic">
          Aucun intérêt général.
        </p>
      {/if}
    </div>
  </div>
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
      {:else}
        <input type="hidden" name="kind" value={$form.kind} />
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
            placeholder="ex: ⚽"
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
