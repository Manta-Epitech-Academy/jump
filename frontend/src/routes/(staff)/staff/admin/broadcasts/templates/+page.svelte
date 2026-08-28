<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Table from '$lib/components/ui/table';
  import Plus from '@lucide/svelte/icons/plus';
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
  import Copy from '@lucide/svelte/icons/copy';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ChannelBadge from '$lib/components/admin/broadcasts/ChannelBadge.svelte';

  let { data } = $props();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  // One pair of hidden forms per row (duplicate + delete). Dropdown menu items
  // call `requestSubmit()` on the right form — keeps the actions native to
  // SvelteKit / use:enhance so we get redirect + revalidation for free.
  let duplicateForms = $state<Record<string, HTMLFormElement | undefined>>({});
  let deleteForms = $state<Record<string, HTMLFormElement | undefined>>({});

  function duplicate(id: string) {
    duplicateForms[id]?.requestSubmit();
  }

  function askDelete(id: string, usageCount: number) {
    const msg =
      usageCount > 0
        ? `Impossible : ${usageCount} envoi(s) utilisent ce template.\nSupprime ou archive d'abord les envois liés.`
        : 'Supprimer ce template ?';
    if (usageCount > 0) {
      toast.error(msg);
      return;
    }
    if (confirm(msg)) {
      deleteForms[id]?.requestSubmit();
    }
  }

  const th = 'text-xs uppercase';
</script>

{#snippet newTemplate()}
  <Button href={resolve('/staff/admin/broadcasts/templates/new')}>
    <Plus class="mr-1 h-4 w-4" /> Nouveau template
  </Button>
{/snippet}

<div class="space-y-6">
  <PageHeader
    title="Templates"
    accent="messages"
    subtitle="Modèles réutilisables (mail / SMS) pour les envois en masse et les mails transactionnels"
    actions={newTemplate}
  />

  <p class="text-sm text-muted-foreground">
    {data.templates.length} template{data.templates.length > 1 ? 's' : ''}
  </p>

  {#if data.templates.length === 0}
    <div
      class="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground"
    >
      Aucun template pour le moment.
    </div>
  {:else}
    <div class="overflow-hidden rounded-sm border">
      <Table.Root>
        <Table.Header class="bg-muted/50">
          <Table.Row>
            <Table.Head class={th}>Nom</Table.Head>
            <Table.Head class={th}>Canal</Table.Head>
            <Table.Head class={th}>Sujet</Table.Head>
            <Table.Head class={th}>Utilisations</Table.Head>
            <Table.Head class={th}>MAJ</Table.Head>
            <Table.Head class={th}></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.templates as t (t.id)}
            <Table.Row class="hover:bg-muted/30">
              <Table.Cell class="font-medium">{t.name}</Table.Cell>
              <Table.Cell><ChannelBadge channel={t.channel} /></Table.Cell>
              <Table.Cell
                class="max-w-xs truncate text-muted-foreground"
                title={t.subject ?? ''}
              >
                {t.subject ?? '—'}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground">
                {t._count.broadcasts}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground">
                {formatter.format(t.updatedAt)}
              </Table.Cell>
              <Table.Cell class="text-right">
                <form
                  method="POST"
                  action="?/duplicate"
                  bind:this={duplicateForms[t.id]}
                  use:enhance={() => {
                    return async ({ result }) => {
                      if (result.type === 'redirect') {
                        goto(result.location);
                      } else if (result.type === 'failure') {
                        toast.error('Duplication impossible.');
                      }
                    };
                  }}
                  class="hidden"
                >
                  <input type="hidden" name="id" value={t.id} />
                </form>
                <form
                  method="POST"
                  action="?/delete"
                  bind:this={deleteForms[t.id]}
                  use:enhance={() => {
                    return async ({ result }) => {
                      if (result.type === 'success') {
                        toast.success('Template supprimé.');
                        await invalidateAll();
                      } else if (result.type === 'failure') {
                        const data = result.data as
                          { deleteError?: string } | undefined;
                        toast.error(
                          data?.deleteError ?? 'Suppression impossible.',
                        );
                      }
                    };
                  }}
                  class="hidden"
                >
                  <input type="hidden" name="id" value={t.id} />
                </form>

                <div class="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    href={resolve(`/staff/admin/broadcasts/templates/${t.id}`)}
                  >
                    Modifier
                  </Button>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="sm"
                          aria-label="Actions"
                        >
                          <MoreHorizontal class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" class="w-44">
                      <DropdownMenu.Item onSelect={() => duplicate(t.id)}>
                        <Copy class="mr-2 h-4 w-4" />
                        Dupliquer
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        onSelect={() => askDelete(t.id, t._count.broadcasts)}
                        class="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2 class="mr-2 h-4 w-4" />
                        Supprimer
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}
</div>
