<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import Plus from '@lucide/svelte/icons/plus';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
  import Copy from '@lucide/svelte/icons/copy';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { BROADCAST_CHANNEL_LABELS } from '$lib/domain/broadcasts';

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
</script>

<header class="space-y-2">
  <h1 class="text-2xl font-bold tracking-tight">Templates</h1>
  <p class="text-sm text-muted-foreground">
    Crée et édite les templates réutilisables pour les envois en masse et les
    mails transactionnels.
  </p>
</header>

<div class="flex items-center justify-between">
  <p class="text-sm text-muted-foreground">
    {data.templates.length} template{data.templates.length > 1 ? 's' : ''}
  </p>
  <Button href={resolve('/staff/admin/broadcasts/templates/new')}>
    <Plus class="mr-1 h-4 w-4" /> Nouveau template
  </Button>
</div>

{#if data.templates.length === 0}
  <div
    class="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"
  >
    Aucun template pour le moment.
  </div>
{:else}
  <div class="overflow-hidden rounded-lg border">
    <table class="w-full text-sm">
      <thead class="border-b bg-muted/50 text-left text-xs uppercase">
        <tr>
          <th class="px-4 py-2">Nom</th>
          <th class="px-4 py-2">Canal</th>
          <th class="px-4 py-2">Sujet</th>
          <th class="px-4 py-2">Utilisations</th>
          <th class="px-4 py-2">MAJ</th>
          <th class="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each data.templates as t (t.id)}
          <tr class="border-b last:border-b-0 hover:bg-muted/30">
            <td class="px-4 py-2 font-medium">{t.name}</td>
            <td class="px-4 py-2">
              <span class="inline-flex items-center gap-1">
                {#if t.channel === 'mail'}
                  <Mail class="h-3.5 w-3.5" />
                {:else}
                  <MessageSquare class="h-3.5 w-3.5" />
                {/if}
                {BROADCAST_CHANNEL_LABELS[t.channel]}
              </span>
            </td>
            <td
              class="max-w-xs truncate px-4 py-2 text-muted-foreground"
              title={t.subject ?? ''}
            >
              {t.subject ?? '—'}
            </td>
            <td class="px-4 py-2 text-muted-foreground">
              {t._count.broadcasts}
            </td>
            <td class="px-4 py-2 text-muted-foreground">
              {formatter.format(t.updatedAt)}
            </td>
            <td class="px-4 py-2 text-right">
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
                        | { deleteError?: string }
                        | undefined;
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
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
