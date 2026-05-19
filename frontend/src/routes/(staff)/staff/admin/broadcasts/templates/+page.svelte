<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import Plus from '@lucide/svelte/icons/plus';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import { BROADCAST_CHANNEL_LABELS } from '$lib/domain/broadcasts';

  let { data } = $props();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
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
              <Button
                variant="ghost"
                size="sm"
                href={resolve(`/staff/admin/broadcasts/templates/${t.id}`)}
              >
                Modifier
              </Button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
