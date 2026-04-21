<script lang="ts">
  import { enhance } from '$app/forms';
  import {
    Upload,
    Trash2,
    Download,
    FileIcon,
    FileImage,
    FileText,
    FileArchive,
    FileVideo,
    FileAudio,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';

  let { data } = $props();

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
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Fichiers <span class="text-epi-pink">Partagés</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Espace de partage entre administrateurs
      </p>
    </div>
    <form
      method="POST"
      action="?/upload"
      enctype="multipart/form-data"
      use:enhance={() => {
        uploading = true;
        return async ({ result, update }) => {
          uploading = false;
          if (result.type === 'success') {
            toast.success('Fichier uploadé avec succès');
            if (fileInput) fileInput.value = '';
            await update();
          } else if (result.type === 'failure') {
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
        disabled={uploading}
        class="bg-epi-pink text-white hover:bg-epi-pink/90"
        onclick={() => fileInput?.click()}
      >
        <Upload class="mr-2 h-4 w-4" />
        {uploading ? 'Upload...' : 'Uploader'}
      </Button>
    </form>
  </div>

  {#if data.files.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-sm border bg-card py-16 shadow-sm"
    >
      <FileIcon class="mb-4 h-12 w-12 text-muted-foreground/40" />
      <p class="text-lg font-bold text-muted-foreground">
        Aucun fichier partagé
      </p>
      <p class="text-sm text-muted-foreground/60">
        Cliquez sur « Uploader » pour ajouter un fichier.
      </p>
    </div>
  {:else}
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head class="w-12"></Table.Head>
            <Table.Head>Nom du fichier</Table.Head>
            <Table.Head>Taille</Table.Head>
            <Table.Head>Uploadé par</Table.Head>
            <Table.Head>Date</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.files as file}
            {@const Icon = getFileIcon(file.contentType)}
            <Table.Row>
              <Table.Cell>
                <Icon class="h-4 w-4 text-muted-foreground" />
              </Table.Cell>
              <Table.Cell class="max-w-xs truncate font-bold">
                {file.name}
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
                              if (
                                result.type === 'success' &&
                                result.data?.signedUrl
                              ) {
                                const a = document.createElement('a');
                                a.href = result.data.signedUrl as string;
                                a.download =
                                  (result.data.fileName as string) || '';
                                a.click();
                              } else {
                                toast.error('Erreur lors du téléchargement');
                              }
                            };
                          }}
                        >
                          <Button
                            {...props}
                            type="submit"
                            variant="ghost"
                            size="icon"
                          >
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
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title="Supprimer le fichier"
    description="Êtes-vous sûr ? Le fichier sera définitivement supprimé."
  />
</div>
