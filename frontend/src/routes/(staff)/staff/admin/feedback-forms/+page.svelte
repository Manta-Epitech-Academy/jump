<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { enhance as formEnhance } from '$app/forms';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import Plus from '@lucide/svelte/icons/plus';
  import Copy from '@lucide/svelte/icons/copy';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import type { FormListRow, FormsCohort } from './+page.server';

  let { data }: { data: PageData } = $props();

  let createOpen = $state(false);
  let deleteOpen = $state(false);
  let deleteTarget = $state<FormListRow | null>(null);

  // The cohort streams in as an un-awaited promise. We resolve it into local
  // `$state` (rather than binding `{#await}` directly) because this page now
  // writes optimistically: a status change mutates the row in place, and the
  // delete dialog's `update()` rebuilds `data.cohort`. The stale-promise guard
  // swaps later resolutions in silently, so neither reflashes the whole table.
  let cohort = $state<FormsCohort | null>(null);
  $effect(() => {
    const p = data.cohort;
    void p.then((c) => {
      if (data.cohort === p) cohort = c;
    });
  });

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
  // Lifecycle order shown in the per-row status menu.
  const STATUS_ORDER = ['draft', 'published', 'archived'] as const;

  /** Id of the row whose status PATCH is in flight (locks its trigger). */
  let statusPending = $state<string | null>(null);

  // Changes a form's status straight from the list, reusing the builder's meta
  // endpoint so status mutation has a single source of truth. Archiving is the
  // supported way to retire a form that already has responses (it can't be
  // deleted), so the control lives right where that need surfaces.
  async function setStatus(row: FormListRow, status: string) {
    if (status === row.status) return;
    statusPending = row.id;
    try {
      const res = await fetch(
        resolve(`/staff/admin/feedback-forms/${row.id}/meta`),
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        toast.error(body?.message ?? 'Le changement de statut a échoué.');
        return;
      }
      row.status = status;
      // Publishing a form no audience can reach is allowed but pointless; mirror
      // the builder's reachability warning instead of letting it fail silently.
      if (
        status === 'published' &&
        !row.allowsAuthenticatedAccess &&
        !row.allowsPublicAccess
      ) {
        toast.warning(
          'Publié, mais aucun mode d’accès n’est activé : personne ne peut répondre. Ouvrez les paramètres pour en activer un.',
        );
      } else {
        toast.success(`Statut : ${STATUS_LABEL[status]}`);
      }
    } finally {
      statusPending = null;
    }
  }

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

  {#if cohort === null}
    <p class="text-sm text-muted-foreground">Chargement…</p>
  {:else if cohort.rows.length === 0}
    <div
      class="rounded-sm border border-dashed bg-muted/10 p-16 text-center text-sm text-muted-foreground"
    >
      Aucun formulaire pour le moment.
    </div>
  {:else}
    <Tooltip.Provider delayDuration={300}>
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
                  {#if row.allowsPublicAccess}
                    <!-- Public form: show the real shareable link (was a bare
                         `/slug`, which looked like a route but wasn't one). -->
                    <span
                      class="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground"
                    >
                      /bilan/{row.slug}
                      <CopyButton
                        value={`${page.url.origin}/bilan/${row.slug}`}
                        label="Copier le lien public"
                      />
                    </span>
                  {:else}
                    <!-- Auth-only: the slug is an identifier, not a URL, so
                         render it without a leading slash. -->
                    <span class="block font-mono text-xs text-muted-foreground"
                      >{row.slug}</span
                    >
                  {/if}
                </Table.Cell>
                <Table.Cell>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      disabled={statusPending === row.id}
                      class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 {STATUS_CLASS[
                        row.status
                      ]}"
                      aria-label="Changer le statut"
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                      <ChevronDown class="h-3 w-3 opacity-70" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start" class="w-44">
                      <DropdownMenu.RadioGroup
                        value={row.status}
                        onValueChange={(v) => setStatus(row, v)}
                      >
                        {#each STATUS_ORDER as s (s)}
                          <DropdownMenu.RadioItem value={s}>
                            {STATUS_LABEL[s]}
                          </DropdownMenu.RadioItem>
                        {/each}
                      </DropdownMenu.RadioGroup>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
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
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <Button
                            {...props}
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8"
                            href={resolve(
                              `/staff/admin/feedback-forms/${row.id}/responses`,
                            )}
                          >
                            <MessageSquare class="h-4 w-4" />
                            <span class="sr-only">Réponses</span>
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content
                        >Réponses ({row.submissionCount})</Tooltip.Content
                      >
                    </Tooltip.Root>
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <Button
                            {...props}
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8"
                            href={resolve(
                              `/staff/admin/feedback-forms/${row.id}`,
                            )}
                          >
                            <Pencil class="h-4 w-4" />
                            <span class="sr-only">Modifier</span>
                          </Button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content>Modifier</Tooltip.Content>
                    </Tooltip.Root>
                    <form
                      method="POST"
                      action="?/duplicate"
                      use:formEnhance={() =>
                        async ({ result, update }) => {
                          // The action redirects to the new form; toast first so
                          // the duplication is acknowledged (testers weren't sure
                          // it had happened) and persists across the navigation.
                          if (result.type === 'redirect') {
                            toast.success('Formulaire dupliqué');
                          }
                          await update();
                        }}
                    >
                      <input type="hidden" name="id" value={row.id} />
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props })}
                            <Button
                              {...props}
                              type="submit"
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8"
                            >
                              <Copy class="h-4 w-4" />
                              <span class="sr-only">Dupliquer</span>
                            </Button>
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content>Dupliquer</Tooltip.Content>
                      </Tooltip.Root>
                    </form>
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <!-- Span wrapper so the tooltip still fires while the
                               button is disabled (a disabled button emits no
                               pointer events); this is the case where the hint
                               matters most: why deletion is blocked. -->
                          <span {...props} class="inline-flex">
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={row.submissionCount > 0}
                              onclick={() => askDelete(row)}
                            >
                              <Trash2 class="h-4 w-4" />
                              <span class="sr-only">Supprimer</span>
                            </Button>
                          </span>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {row.submissionCount > 0
                          ? 'Ce formulaire a des réponses : passez son statut à « Archivé » pour le retirer.'
                          : 'Supprimer'}
                      </Tooltip.Content>
                    </Tooltip.Root>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    </Tooltip.Provider>
  {/if}
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
