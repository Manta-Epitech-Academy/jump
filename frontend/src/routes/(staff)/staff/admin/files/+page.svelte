<script lang="ts">
  import { enhance } from '$app/forms';
  import Upload from '@lucide/svelte/icons/upload';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Download from '@lucide/svelte/icons/download';
  import FileIcon from '@lucide/svelte/icons/file';
  import FileImage from '@lucide/svelte/icons/file-image';
  import FileText from '@lucide/svelte/icons/file-text';
  import FileArchive from '@lucide/svelte/icons/file-archive';
  import FileVideo from '@lucide/svelte/icons/file-video';
  import FileAudio from '@lucide/svelte/icons/file-audio';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import { track, errReason, bucketBytes, daysBetween } from '$lib/analytics';

  let { data } = $props();

  type FileRow = (typeof data)['files'][number];

  let uploading = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  function confirmDelete(id: string) {
    itemToDelete = id;
    deleteDialogOpen = true;
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function formatDate(date: string | Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }

  function getFileIcon(contentType: string) {
    if (contentType.startsWith('image/')) return FileImage;
    if (contentType.startsWith('video/')) return FileVideo;
    if (contentType.startsWith('audio/')) return FileAudio;
    if (contentType === 'application/pdf' || contentType.startsWith('text/'))
      return FileText;
    if (
      contentType.includes('zip') ||
      contentType.includes('tar') ||
      contentType.includes('rar')
    )
      return FileArchive;
    return FileIcon;
  }

  // Client-side search + sort: the shared list is small (admins share a handful
  // of files), so filter/sort in memory rather than round-tripping the server.
  let searchQuery = $state('');
  let sortKey = $state<string | null>('createdAt');
  let sortDir = $state<'asc' | 'desc'>('desc');

  const uploaderLabel = (f: FileRow) =>
    f.uploadedBy.user.name || f.uploadedBy.user.email || '';

  const filtered = $derived(
    data.files.filter((f) =>
      f.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
    ),
  );
  const sorted = $derived.by(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => dir * compare(a, b, sortKey));
  });

  function compare(a: FileRow, b: FileRow, key: string | null): number {
    switch (key) {
      case 'name':
        return a.name.localeCompare(b.name, 'fr');
      case 'size':
        return a.size - b.size;
      case 'uploadedBy':
        return uploaderLabel(a).localeCompare(uploaderLabel(b), 'fr');
      case 'createdAt':
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      default:
        return 0;
    }
  }

  function toggleSort(key: string) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  const columns: ColumnDef[] = [
    { key: 'name', label: 'Nom du fichier', sortable: true },
    { key: 'size', label: 'Taille', sortable: true },
    { key: 'uploadedBy', label: 'Uploadé par', sortable: true },
    { key: 'createdAt', label: 'Date', sortable: true },
    { key: 'actions', label: 'Actions', align: 'right' },
  ];
</script>

<svelte:head>
  <title>Fichiers</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Fichiers <span class="text-epi-pink">Partagés</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Espace de partage entre administrateurs
    </p>
  </div>

  <DataTableToolbar
    searchValue={searchQuery}
    onSearchInput={(v) => (searchQuery = v)}
    searchPlaceholder="Rechercher un fichier…"
    count={sorted.length}
    countNoun="fichier"
  >
    {#snippet actions()}
      <form
        method="POST"
        action="?/upload"
        enctype="multipart/form-data"
        use:enhance={() => {
          uploading = true;
          const file = fileInput?.files?.[0] ?? null;
          return async ({ result, update }) => {
            uploading = false;
            if (result.type === 'success') {
              track('admin_file_uploaded', {
                sizeBucket: bucketBytes(file?.size ?? null),
                kind: file?.type ?? 'unknown',
              });
              toast.success('Fichier uploadé avec succès');
              if (fileInput) fileInput.value = '';
              await update();
            } else if (result.type === 'failure') {
              track('admin_file_upload_failed', {
                reason: errReason(result),
                sizeBucket: bucketBytes(file?.size ?? null),
              });
              toast.error(
                (result.data as { message?: string })?.message ||
                  "Erreur lors de l'upload",
              );
            }
          };
        }}
      >
        <input
          bind:this={fileInput}
          type="file"
          name="file"
          id="file-upload"
          class="hidden"
          onchange={(e) => {
            const form = (e.target as HTMLInputElement).closest('form');
            if (form) form.requestSubmit();
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={uploading}
          class="bg-epi-pink text-white hover:bg-epi-pink/90"
          onclick={() => fileInput?.click()}
        >
          <Upload class="mr-2 h-4 w-4" />
          {uploading ? 'Upload...' : 'Uploader'}
        </Button>
      </form>
    {/snippet}
  </DataTableToolbar>

  <SortableTable
    {columns}
    rows={sorted}
    {sortKey}
    {sortDir}
    onSort={toggleSort}
    rowKey={(f) => f.id}
  >
    {#snippet row(file)}
      {@const Icon = getFileIcon(file.contentType)}
      <Table.Cell class="max-w-xs font-bold">
        <div class="flex items-center gap-2">
          <Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="truncate">{file.name}</span>
        </div>
      </Table.Cell>
      <Table.Cell class="text-muted-foreground">
        {formatSize(file.size)}
      </Table.Cell>
      <Table.Cell class="text-muted-foreground">
        {file.uploadedBy.user.name || file.uploadedBy.user.email}
      </Table.Cell>
      <Table.Cell class="text-xs text-muted-foreground">
        {formatDate(file.createdAt)}
      </Table.Cell>
      <Table.Cell class="text-right">
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <form
                  method="POST"
                  action="?/download&id={file.id}"
                  class="inline"
                  use:enhance={() => {
                    return async ({ result }) => {
                      if (result.type === 'success' && result.data?.signedUrl) {
                        track('admin_file_downloaded', {
                          sizeBucket: bucketBytes(file.size),
                          kind: file.contentType,
                        });
                        const a = document.createElement('a');
                        a.href = result.data.signedUrl as string;
                        a.download = (result.data.fileName as string) || '';
                        a.click();
                      } else {
                        track('admin_file_download_failed', {
                          reason: errReason(result),
                          sizeBucket: bucketBytes(file.size),
                        });
                        toast.error('Erreur lors du téléchargement');
                      }
                    };
                  }}
                >
                  <Button {...props} type="submit" variant="ghost" size="icon">
                    <Download class="h-4 w-4" />
                  </Button>
                </form>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content><p>Télécharger</p></Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="text-destructive hover:text-destructive"
                  onclick={() => confirmDelete(file.id)}
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content><p>Supprimer</p></Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </Table.Cell>
    {/snippet}

    {#snippet empty()}
      <EmptyState
        icon={FileIcon}
        title="Aucun fichier"
        description={searchQuery
          ? 'Aucun fichier ne correspond à votre recherche.'
          : 'Cliquez sur « Uploader » pour partager un fichier.'}
      />
    {/snippet}
  </SortableTable>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title="Supprimer le fichier"
    description="Êtes-vous sûr ? Le fichier sera définitivement supprimé."
    onSuccess={() => {
      const f = data.files.find((x) => x.id === itemToDelete);
      track('admin_file_deleted', {
        sizeBucket: f ? bucketBytes(f.size) : null,
        kind: f?.contentType ?? null,
        ageDays: f ? daysBetween(f.createdAt) : null,
      });
    }}
  />
</div>
