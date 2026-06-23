<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import CmsEditor from '$lib/components/cms/CmsEditor.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Save from '@lucide/svelte/icons/save';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';

  let { data, form: actionData }: { data: PageData; form: ActionData } =
    $props();

  let creating = $state(false);
  let newTitle = $state('');
  let newContent = $state('');
  let newCampusId = $state('');
  let confirmDeleteId = $state<string | null>(null);
  let filterCampusId = $state('');

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const filteredPosts = $derived(
    filterCampusId
      ? data.posts.filter((p) =>
          filterCampusId === '__cross__'
            ? p.campusId === null
            : p.campusId === filterCampusId,
        )
      : data.posts,
  );

  function startCreate() {
    newTitle = '';
    newContent = '';
    newCampusId = '';
    creating = true;
  }

  function cancelCreate() {
    creating = false;
    confirmDeleteId = null;
  }

  $effect(() => {
    if (actionData?.success) {
      toast.success('Actualite enregistree.');
      cancelCreate();
    }
    if (actionData?.error) {
      toast.error(actionData.error as string);
    }
  });
</script>

<div class="mb-6">
  <AdminPageHeader title="Gestion des" accent="actualites" cursor />
  <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
    Visualisez et gerez les actualites de tous les campus. Vous pouvez creer des
    actualites globales (tous les campus) ou ciblees sur un campus specifique.
  </p>
</div>

<div class="mx-auto max-w-4xl space-y-6">
  <!-- Toolbar: filter + create -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <label for="campus-filter" class="sr-only">Filtrer par campus</label>
      <select
        id="campus-filter"
        bind:value={filterCampusId}
        class="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:outline-none"
      >
        <option value="">Tous les campus</option>
        <option value="__cross__">Inter-campus uniquement</option>
        {#each data.campuses as campus}
          <option value={campus.id}>{campus.name}</option>
        {/each}
      </select>
    </div>
    {#if !creating}
      <Button onclick={startCreate}>
        <Plus class="mr-2 h-4 w-4" />
        Nouvelle actualite
      </Button>
    {/if}
  </div>

  <!-- Create form -->
  {#if creating}
    <div class="rounded-lg border border-border bg-card p-6">
      <h2 class="mb-4 text-lg font-semibold">Nouvelle actualite</h2>
      <form
        method="POST"
        action="?/create"
        use:enhance={() => {
          return async ({ update }) => {
            await update();
          };
        }}
      >
        <div class="space-y-4">
          <div>
            <label for="new-title" class="mb-1 block text-sm font-medium">
              Titre
            </label>
            <input
              id="new-title"
              name="title"
              type="text"
              bind:value={newTitle}
              required
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
              placeholder="Titre de l'actualite..."
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">Contenu</label>
            <input type="hidden" name="content" value={newContent} />
            <CmsEditor
              bind:content={newContent}
              allowImageUpload
              placeholder="Redigez le contenu de l'actualite..."
            />
          </div>
          <div>
            <label for="new-campus" class="mb-1 block text-sm font-medium">
              Campus
            </label>
            <select
              id="new-campus"
              name="campusId"
              bind:value={newCampusId}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:outline-none"
            >
              <option value="">Tous les campus (inter-campus)</option>
              {#each data.campuses as campus}
                <option value={campus.id}>{campus.name}</option>
              {/each}
            </select>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="outline" type="button" onclick={cancelCreate}>
              <X class="mr-2 h-4 w-4" />
              Annuler
            </Button>
            <Button type="submit">
              <Save class="mr-2 h-4 w-4" />
              Publier
            </Button>
          </div>
        </div>
      </form>
    </div>
  {/if}

  <!-- Post list -->
  {#if filteredPosts.length === 0 && !creating}
    <div class="rounded-lg border border-dashed border-border p-8 text-center">
      <p class="text-muted-foreground">
        Aucune actualite pour cette selection.
      </p>
    </div>
  {/if}

  <div class="space-y-4">
    {#each filteredPosts as post (post.id)}
      <div class="group rounded-lg border border-border bg-card p-6">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-semibold">{post.title}</h3>
              {#if post.campusName}
                <Badge variant="outline">{post.campusName}</Badge>
              {:else}
                <Badge variant="secondary">Tous les campus</Badge>
              {/if}
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
              Publie le {dateFmt.format(new Date(post.publishedAt))} par {post.authorName}
            </p>
          </div>
          <div
            class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          >
            {#if confirmDeleteId === post.id}
              <form
                method="POST"
                action="?/delete"
                use:enhance={() => {
                  return async ({ update }) => {
                    confirmDeleteId = null;
                    await update();
                  };
                }}
              >
                <input type="hidden" name="id" value={post.id} />
                <Button variant="destructive" size="sm" type="submit">
                  Confirmer
                </Button>
              </form>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => (confirmDeleteId = null)}
              >
                Annuler
              </Button>
            {:else}
              <Button
                variant="ghost"
                size="icon"
                onclick={() => (confirmDeleteId = post.id)}
              >
                <Trash2 class="h-4 w-4 text-destructive" />
              </Button>
            {/if}
          </div>
        </div>
        <div
          class="prose prose-sm mt-4 max-w-none prose-slate dark:prose-invert"
        >
          {@html post.content}
        </div>
      </div>
    {/each}
  </div>
</div>
