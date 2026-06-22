<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { enhance as formEnhance } from '$app/forms';
  import Plus from '@lucide/svelte/icons/plus';
  import Copy from '@lucide/svelte/icons/copy';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import type { FormListRow } from './+page.server';

  let { data }: { data: PageData } = $props();

  let createOpen = $state(false);
  let deleteOpen = $state(false);
  let deleteTarget = $state<FormListRow | null>(null);

  const { form, errors, enhance } = superForm(
    untrack(() => data.createFormForm),
    {
      onResult: ({ result }) => {
        if (result.type === 'redirect') createOpen = false;
      },
    },
  );

  const STATUS_LABEL: Record<string, string> = {
    draft: 'Brouillon',
    published: 'Publié',
    archived: 'Archivé',
  };
  const STATUS_CLASS: Record<string, string> = {
    draft:
      'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    published:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    archived: 'bg-slate-100 text-slate-500 dark:bg-slate-800',
  };

  function askDelete(row: FormListRow) {
    deleteTarget = row;
    deleteOpen = true;
  }
</script>

<svelte:head><title>Formulaires de bilan</title></svelte:head>

<div class="space-y-6">
  <AdminPageHeader title="Formulaires" accent="de bilan">
    {#snippet actions()}
      <Button size="sm" class="rounded-sm" onclick={() => (createOpen = true)}>
        <Plus class="mr-1.5 h-4 w-4" /> Nouveau formulaire
      </Button>
    {/snippet}
  </AdminPageHeader>

  {#await data.cohort}
    <p class="text-sm text-muted-foreground">Chargement…</p>
  {:then cohort}
    {#if cohort.rows.length === 0}
      <div
        class="rounded-sm border border-dashed bg-muted/10 p-16 text-center text-sm text-muted-foreground"
      >
        Aucun formulaire pour le moment.
      </div>
    {:else}
      <div class="rounded-sm border bg-card shadow-sm">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Titre</Table.Head>
              <Table.Head>Statut</Table.Head>
              <Table.Head class="text-right">Questions</Table.Head>
              <Table.Head class="text-right">Réponses</Table.Head>
              <Table.Head>Accès</Table.Head>
              <Table.Head class="text-right">Actions</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each cohort.rows as row (row.id)}
              <Table.Row>
                <Table.Cell>
                  <a
                    href={resolve(`/staff/admin/feedback-forms/${row.id}`)}
                    class="font-medium hover:underline"
                  >
                    {row.title}
                  </a>
                  <span class="block font-mono text-xs text-muted-foreground"
                    >/{row.slug}</span
                  >
                </Table.Cell>
                <Table.Cell>
                  <span
                    class="inline-flex rounded-sm px-2 py-0.5 text-xs font-medium {STATUS_CLASS[
                      row.status
                    ]}"
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </Table.Cell>
                <Table.Cell class="text-right font-mono text-sm"
                  >{row.questionCount}</Table.Cell
                >
                <Table.Cell class="text-right font-mono text-sm"
                  >{row.submissionCount}</Table.Cell
                >
                <Table.Cell class="text-xs text-muted-foreground">
                  {row.allowsPublicAccess ? 'Auth + Public' : 'Auth'}
                </Table.Cell>
                <Table.Cell>
                  <div class="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      title="Réponses ({row.submissionCount})"
                      href={resolve(
                        `/staff/admin/feedback-forms/${row.id}/responses`,
                      )}
                    >
                      <MessageSquare class="h-4 w-4" />
                      <span class="sr-only">Réponses</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      href={resolve(`/staff/admin/feedback-forms/${row.id}`)}
                    >
                      <Pencil class="h-4 w-4" />
                      <span class="sr-only">Modifier</span>
                    </Button>
                    <form method="POST" action="?/duplicate" use:formEnhance>
                      <input type="hidden" name="id" value={row.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8"
                      >
                        <Copy class="h-4 w-4" />
                        <span class="sr-only">Dupliquer</span>
                      </Button>
                    </form>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={row.submissionCount > 0}
                      title={row.submissionCount > 0
                        ? 'Formulaire avec des réponses : archivez-le plutôt'
                        : 'Supprimer'}
                      onclick={() => askDelete(row)}
                    >
                      <Trash2 class="h-4 w-4" />
                      <span class="sr-only">Supprimer</span>
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  {/await}
</div>

<Dialog.Root bind:open={createOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Nouveau formulaire</Dialog.Title>
      <Dialog.Description>
        Un brouillon vide est créé ; ajoutez ensuite les sections et questions.
      </Dialog.Description>
    </Dialog.Header>
    <form method="POST" action="?/create" use:enhance class="space-y-4">
      <div class="space-y-1.5">
        <Label for="title">Titre</Label>
        <Input id="title" name="title" bind:value={$form.title} />
        {#if $errors.title}
          <p class="text-xs text-destructive">{$errors.title}</p>
        {/if}
      </div>
      <div class="space-y-1.5">
        <Label for="intro">Message d'introduction</Label>
        <Textarea id="intro" name="intro" rows={4} bind:value={$form.intro} />
        {#if $errors.intro}
          <p class="text-xs text-destructive">{$errors.intro}</p>
        {/if}
      </div>
      <Dialog.Footer>
        <Button type="submit">Créer</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

{#if deleteTarget}
  <ConfirmDeleteDialog
    bind:open={deleteOpen}
    action={`?/delete&id=${deleteTarget.id}`}
    title="Supprimer ce formulaire ?"
    description={`« ${deleteTarget.title} » sera définitivement supprimé.`}
  />
{/if}
