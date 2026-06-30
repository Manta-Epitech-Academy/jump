<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import CmsEditor from '$lib/components/cms/CmsEditor.svelte';
  import VariableInserter from '$lib/components/cms/VariableInserter.svelte';
  import DateTimePicker from '$lib/components/staff/DateTimePicker.svelte';
  import { defaultExpiresAt, NEWS_POST_VARIABLES } from '$lib/domain/newsPost';
  import Save from '@lucide/svelte/icons/save';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';

  let { data, form: actionData }: { data: PageData; form: ActionData } =
    $props();

  type Post = (typeof data.posts)[number];

  let creating = $state(false);
  let editingPost = $state<Post | null>(null);

  let newTitle = $state('');
  let newContent = $state('');
  let newEventId = $state('');
  let newPublishNow = $state(true);
  let newPublishedAt = $state('');
  let newHasExpiration = $state(false);
  let newExpiresAt = $state('');

  let editTitle = $state('');
  let editContent = $state('');
  let editPublishNow = $state(true);
  let editPublishedAt = $state('');
  let editHasExpiration = $state(false);
  let editExpiresAt = $state('');

  let confirmDeleteId = $state<string | null>(null);

  let newEditorRef: CmsEditor | undefined = $state();
  let editEditorRef: CmsEditor | undefined = $state();

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  function toLocalInput(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : new Date(d.getTime());
    const mins = date.getMinutes();
    const rounded = Math.ceil(mins / 15) * 15;
    date.setMinutes(rounded, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function daysUntilExpiry(expiresAt: string | null): number | null {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function startCreate() {
    editingPost = null;
    newTitle = '';
    newContent = '';
    newEventId = '';
    newPublishNow = true;
    newPublishedAt = toLocalInput(new Date());
    newHasExpiration = false;
    newExpiresAt = '';
    creating = true;
  }

  function startEdit(post: Post) {
    creating = false;
    editingPost = post;
    editTitle = post.title;
    editContent = post.content;
    const isFuture = new Date(post.publishedAt) > new Date();
    editPublishNow = !isFuture;
    editPublishedAt = toLocalInput(post.publishedAt);
    editHasExpiration = !!post.expiresAt;
    editExpiresAt = post.expiresAt ? toLocalInput(post.expiresAt) : '';
  }

  function cancelEdit() {
    creating = false;
    editingPost = null;
    confirmDeleteId = null;
  }

  $effect(() => {
    if (actionData?.success) {
      toast.success('Actualité enregistrée !');
      cancelEdit();
    }
    if (actionData?.error) {
      toast.error(actionData.error as string);
    }
  });
</script>

<div class="space-y-6 pb-10">
  <PageHeader title="Actualités">
    {#snippet children()}
      {#if !creating && !editingPost}
        <Button onclick={startCreate}>
          <Plus class="mr-2 h-4 w-4" />
          Nouvelle actualité
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <div class="mx-auto max-w-4xl">
    {#if creating}
      <div class="rounded-lg border border-border bg-card p-6">
        <h2 class="mb-4 text-lg font-semibold">Nouvelle actualité</h2>
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
                class="w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                placeholder="Titre de l'actualité..."
              />
            </div>
            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="block text-sm font-medium">Contenu</label>
                <VariableInserter
                  variables={NEWS_POST_VARIABLES}
                  onInsert={(token) => newEditorRef?.insertText(token)}
                />
              </div>
              <input type="hidden" name="content" value={newContent} />
              <CmsEditor
                bind:this={newEditorRef}
                bind:content={newContent}
                allowImageUpload
                placeholder="Rédigez le contenu de l'actualité..."
              />
            </div>
            {#if data.events.length > 0}
              <div>
                <label for="new-event" class="mb-1 block text-sm font-medium">
                  Événement associé (optionnel)
                </label>
                <select
                  id="new-event"
                  name="eventId"
                  bind:value={newEventId}
                  class="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                >
                  <option value="">Aucun</option>
                  {#each data.events as event}
                    <option value={event.id}>{event.title}</option>
                  {/each}
                </select>
              </div>
            {/if}
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={newPublishNow}
                    onchange={() => (newPublishNow = true)}
                    class="accent-primary"
                  />
                  Publier maintenant
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={!newPublishNow}
                    onchange={() => (newPublishNow = false)}
                    class="accent-primary"
                  />
                  Programmer
                </label>
              </div>
              {#if newPublishNow}
                <input type="hidden" name="publishedAt" value="" />
              {:else}
                <DateTimePicker
                  bind:value={newPublishedAt}
                  name="publishedAt"
                  label="Date de publication"
                />
              {/if}
            </div>
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={!newHasExpiration}
                    onchange={() => (newHasExpiration = false)}
                    class="accent-primary"
                  />
                  Sans expiration
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={newHasExpiration}
                    onchange={() => (newHasExpiration = true)}
                    class="accent-primary"
                  />
                  Définir une expiration
                </label>
              </div>
              {#if newHasExpiration}
                <DateTimePicker
                  bind:value={newExpiresAt}
                  name="expiresAt"
                  label="Date d'expiration"
                />
              {:else}
                <input type="hidden" name="expiresAt" value="" />
              {/if}
            </div>
            <div class="flex justify-end gap-2">
              <Button variant="outline" type="button" onclick={cancelEdit}>
                <X class="mr-2 h-4 w-4" />
                Annuler
              </Button>
              <Button type="submit">
                <Save class="mr-2 h-4 w-4" />
                {newPublishNow ? 'Publier' : 'Programmer'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    {/if}

    {#if data.posts.length === 0 && !creating}
      <div
        class="rounded-lg border border-dashed border-border p-8 text-center"
      >
        <p class="text-muted-foreground">
          Aucune actualité pour le moment. Cliquez sur "Nouvelle actualité" pour
          commencer.
        </p>
      </div>
    {/if}

    <div class="space-y-4">
      {#each data.posts as post (post.id)}
        {#if editingPost?.id === post.id && post.campusId}
          <div class="rounded-lg border border-primary/30 bg-card p-6">
            <h2 class="mb-4 text-lg font-semibold">Modifier l'actualité</h2>
            <form
              method="POST"
              action="?/update"
              use:enhance={() => {
                return async ({ update }) => {
                  await update();
                };
              }}
            >
              <input type="hidden" name="id" value={post.id} />
              <div class="space-y-4">
                <div>
                  <label
                    for="edit-title"
                    class="mb-1 block text-sm font-medium"
                  >
                    Titre
                  </label>
                  <input
                    id="edit-title"
                    name="title"
                    type="text"
                    bind:value={editTitle}
                    required
                    class="w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                  />
                </div>
                <div>
                  <div class="mb-1 flex items-center justify-between">
                    <label class="block text-sm font-medium">Contenu</label>
                    <VariableInserter
                      variables={NEWS_POST_VARIABLES}
                      onInsert={(token) => editEditorRef?.insertText(token)}
                    />
                  </div>
                  <input type="hidden" name="content" value={editContent} />
                  <CmsEditor
                    bind:this={editEditorRef}
                    bind:content={editContent}
                    allowImageUpload
                    placeholder="Contenu de l'actualité..."
                  />
                </div>
                <div class="space-y-3">
                  <div class="flex items-center gap-3">
                    <label class="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={editPublishNow}
                        onchange={() => (editPublishNow = true)}
                        class="accent-primary"
                      />
                      Publier maintenant
                    </label>
                    <label class="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={!editPublishNow}
                        onchange={() => (editPublishNow = false)}
                        class="accent-primary"
                      />
                      Programmer
                    </label>
                  </div>
                  {#if editPublishNow}
                    <input type="hidden" name="publishedAt" value="" />
                  {:else}
                    <DateTimePicker
                      bind:value={editPublishedAt}
                      name="publishedAt"
                      label="Date de publication"
                    />
                  {/if}
                </div>
                <div class="space-y-3">
                  <div class="flex items-center gap-3">
                    <label class="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={!editHasExpiration}
                        onchange={() => (editHasExpiration = false)}
                        class="accent-primary"
                      />
                      Sans expiration
                    </label>
                    <label class="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={editHasExpiration}
                        onchange={() => (editHasExpiration = true)}
                        class="accent-primary"
                      />
                      Définir une expiration
                    </label>
                  </div>
                  {#if editHasExpiration}
                    <DateTimePicker
                      bind:value={editExpiresAt}
                      name="expiresAt"
                      label="Date d'expiration"
                    />
                  {:else}
                    <input type="hidden" name="expiresAt" value="" />
                  {/if}
                </div>
                <div class="flex justify-end gap-2">
                  <Button variant="outline" type="button" onclick={cancelEdit}>
                    <X class="mr-2 h-4 w-4" />
                    Annuler
                  </Button>
                  <Button type="submit">
                    <Save class="mr-2 h-4 w-4" />
                    Enregistrer
                  </Button>
                </div>
              </div>
            </form>
          </div>
        {:else}
          <div class="group rounded-lg border border-border bg-card p-6">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold">{post.title}</h3>
                  {#if !post.campusId}
                    <Badge variant="secondary">Tous les campus</Badge>
                  {/if}
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                  Publié le {dateFmt.format(new Date(post.publishedAt))} par {post.authorName}
                  {#if post.expiresAt}
                    {@const days = daysUntilExpiry(post.expiresAt)}
                    {#if days !== null}
                      {#if days <= 0}
                        <span class="ml-2 font-medium text-destructive"
                          >Expiré</span
                        >
                      {:else if days <= 3}
                        <span class="ml-2 font-medium text-orange-500"
                          >Expiré dans {days}j</span
                        >
                      {:else}
                        <span class="ml-2 text-muted-foreground"
                          >Expiré dans {days}j</span
                        >
                      {/if}
                    {/if}
                  {/if}
                </p>
              </div>
              {#if post.campusId}
                <div
                  class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onclick={() => startEdit(post)}
                  >
                    <Pencil class="h-4 w-4" />
                  </Button>
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
              {/if}
            </div>
            <div
              class="prose prose-sm mt-4 max-w-none prose-slate dark:prose-invert"
            >
              {@html post.content}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>
