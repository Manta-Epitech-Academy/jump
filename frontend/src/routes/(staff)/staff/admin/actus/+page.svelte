<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Select from '$lib/components/ui/select';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import CmsEditor from '$lib/components/cms/CmsEditor.svelte';
  import DateTimePicker from '$lib/components/staff/DateTimePicker.svelte';
  import { defaultExpiresAt } from '$lib/domain/newsPost';
  import Plus from '@lucide/svelte/icons/plus';
  import Save from '@lucide/svelte/icons/save';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';

  let { data, form: actionData }: { data: PageData; form: ActionData } =
    $props();

  type Post = (typeof data.posts)[number];

  /** Format a Date or ISO string for datetime-local inputs (YYYY-MM-DDTHH:MM), rounded up to 15min. */
  function toLocalInput(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : new Date(d.getTime());
    const mins = date.getMinutes();
    const rounded = Math.ceil(mins / 15) * 15;
    date.setMinutes(rounded, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  let creating = $state(false);
  let editingPost = $state<Post | null>(null);
  let newTitle = $state('');
  let newContent = $state('');
  let newCampusId = $state('');
  let newEventId = $state('');
  let newPublishedAt = $state('');
  let newExpiresAt = $state('');
  let editTitle = $state('');
  let editContent = $state('');
  let editEventId = $state('');
  let editPublishedAt = $state('');
  let editExpiresAt = $state('');
  let confirmDeleteId = $state<string | null>(null);
  let filterCampusId = $state('__all__');

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const newCampusEvents = $derived(
    newCampusId ? data.events.filter((e) => e.campusId === newCampusId) : [],
  );

  const editCampusEvents = $derived(
    editingPost?.campusId
      ? data.events.filter((e) => e.campusId === editingPost!.campusId)
      : [],
  );

  const filteredPosts = $derived(
    filterCampusId !== '__all__'
      ? data.posts.filter(
          (p) => p.campusId === filterCampusId || p.campusId === null,
        )
      : data.posts,
  );

  function daysUntilExpiry(expiresAt: string | null): number | null {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function startCreate() {
    editingPost = null;
    newTitle = '';
    newContent = '';
    newCampusId = '';
    newEventId = '__none__';
    const now = new Date();
    newPublishedAt = toLocalInput(now);
    newExpiresAt = toLocalInput(defaultExpiresAt(now));
    creating = true;
  }

  function startEdit(post: Post) {
    creating = false;
    editingPost = post;
    editTitle = post.title;
    editContent = post.content;
    editEventId = post.eventId ?? '__none__';
    editPublishedAt = toLocalInput(post.publishedAt);
    editExpiresAt = post.expiresAt ? toLocalInput(post.expiresAt) : '';
  }

  function cancelEdit() {
    creating = false;
    editingPost = null;
    confirmDeleteId = null;
  }

  $effect(() => {
    if (actionData?.success) {
      toast.success('Actualite enregistree.');
      cancelEdit();
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
    <Select.Root
      type="single"
      value={filterCampusId}
      onValueChange={(v) => (filterCampusId = v ?? '__all__')}
    >
      <Select.Trigger class="w-48">
        {filterCampusId !== '__all__'
          ? (data.campuses.find((c) => c.id === filterCampusId)?.name ??
            'Campus')
          : 'Tous les campus'}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="__all__">Tous les campus</Select.Item>
        {#each data.campuses as campus (campus.id)}
          <Select.Item value={campus.id}>{campus.name}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    {#if !creating && !editingPost}
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
              class="w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
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
              class="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
            >
              <option value="">Tous les campus (inter-campus)</option>
              {#each data.campuses as campus}
                <option value={campus.id}>{campus.name}</option>
              {/each}
            </select>
          </div>
          {#if newCampusEvents.length > 0}
            <div>
              <span class="mb-1 block text-sm font-medium"
                >Evenement associe (optionnel)</span
              >
              <input
                type="hidden"
                name="eventId"
                value={newEventId === '__none__' ? '' : newEventId}
              />
              <Select.Root
                type="single"
                value={newEventId}
                onValueChange={(v) => (newEventId = v ?? '__none__')}
              >
                <Select.Trigger class="w-full">
                  {newEventId !== '__none__'
                    ? (newCampusEvents.find((e) => e.id === newEventId)
                        ?.title ?? 'Evenement')
                    : 'Aucun'}
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">Aucun</Select.Item>
                  {#each newCampusEvents as event (event.id)}
                    <Select.Item value={event.id}>{event.title}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}
          <div class="grid grid-cols-2 gap-4">
            <DateTimePicker
              bind:value={newPublishedAt}
              name="publishedAt"
              label="Date de publication"
            />
            <DateTimePicker
              bind:value={newExpiresAt}
              name="expiresAt"
              label="Date d'expiration"
            />
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="outline" type="button" onclick={cancelEdit}>
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
      {#if editingPost?.id === post.id}
        <div class="rounded-lg border border-primary/30 bg-card p-6">
          <h2 class="mb-4 text-lg font-semibold">Modifier l'actualite</h2>
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
                <label for="edit-title" class="mb-1 block text-sm font-medium">
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
                <label class="mb-1 block text-sm font-medium">Contenu</label>
                <input type="hidden" name="content" value={editContent} />
                <CmsEditor
                  bind:content={editContent}
                  allowImageUpload
                  placeholder="Contenu de l'actualite..."
                />
              </div>
              {#if editCampusEvents.length > 0}
                <div>
                  <span class="mb-1 block text-sm font-medium"
                    >Evenement associe (optionnel)</span
                  >
                  <input
                    type="hidden"
                    name="eventId"
                    value={editEventId === '__none__' ? '' : editEventId}
                  />
                  <Select.Root
                    type="single"
                    value={editEventId}
                    onValueChange={(v) => (editEventId = v ?? '__none__')}
                  >
                    <Select.Trigger class="w-full">
                      {editEventId !== '__none__'
                        ? (editCampusEvents.find((e) => e.id === editEventId)
                            ?.title ?? 'Evenement')
                        : 'Aucun'}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="__none__">Aucun</Select.Item>
                      {#each editCampusEvents as event (event.id)}
                        <Select.Item value={event.id}>{event.title}</Select.Item
                        >
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
              {/if}
              <div class="grid grid-cols-2 gap-4">
                <DateTimePicker
                  bind:value={editPublishedAt}
                  name="publishedAt"
                  label="Date de publication"
                />
                <DateTimePicker
                  bind:value={editExpiresAt}
                  name="expiresAt"
                  label="Date d'expiration"
                />
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
                {#if post.campusName}
                  <Badge variant="outline">{post.campusName}</Badge>
                {:else}
                  <Badge variant="secondary">Tous les campus</Badge>
                {/if}
                {#if new Date(post.publishedAt) > new Date()}
                  <Badge variant="outline" class="border-blue-500 text-blue-500"
                    >Programmee</Badge
                  >
                {/if}
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                Publie le {dateFmt.format(new Date(post.publishedAt))} par {post.authorName}
                {#if post.expiresAt}
                  {@const days = daysUntilExpiry(post.expiresAt)}
                  {#if days !== null}
                    {#if days <= 0}
                      <span class="ml-2 font-medium text-destructive"
                        >Expire</span
                      >
                    {:else if days <= 3}
                      <span class="ml-2 font-medium text-orange-500"
                        >Expire dans {days}j</span
                      >
                    {:else}
                      <span class="ml-2 text-muted-foreground"
                        >Expire dans {days}j</span
                      >
                    {/if}
                  {/if}
                {/if}
              </p>
            </div>
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
