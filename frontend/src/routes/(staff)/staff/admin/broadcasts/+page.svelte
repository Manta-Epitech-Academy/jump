<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import Plus from '@lucide/svelte/icons/plus';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import { BROADCAST_CHANNEL_LABELS } from '$lib/domain/broadcasts';
  import type { BroadcastStatus } from '@prisma/client';

  let { data } = $props();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const STATUS_LABEL: Record<BroadcastStatus, string> = {
    queued: 'En file',
    sending: 'En cours',
    sent: 'Envoyé',
    partial_failed: 'Partiel',
    failed: 'Échec',
  };

  const STATUS_STYLE: Record<BroadcastStatus, string> = {
    queued: 'bg-slate-200 text-slate-700',
    sending: 'bg-blue-200 text-blue-800',
    sent: 'bg-emerald-200 text-emerald-800',
    partial_failed: 'bg-amber-200 text-amber-800',
    failed: 'bg-red-200 text-red-800',
  };

  const th = 'text-xs uppercase';
</script>

<header class="space-y-2">
  <h1 class="text-2xl font-bold tracking-tight">Envoi en masse</h1>
  <p class="text-sm text-muted-foreground">
    Lance des envois ciblés (mail / SMS) aux talents, parents ou staff, et suis
    leur acheminement.
  </p>
</header>

<div class="flex items-center justify-between">
  <p class="text-sm text-muted-foreground">
    {data.broadcasts.length} envoi{data.broadcasts.length > 1 ? 's' : ''}
  </p>
  <Button href={resolve('/staff/admin/broadcasts/new')}>
    <Plus class="mr-1 h-4 w-4" /> Nouvel envoi
  </Button>
</div>

{#if data.broadcasts.length === 0}
  <div
    class="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"
  >
    Aucun envoi pour le moment.
  </div>
{:else}
  <div class="overflow-hidden rounded-lg border">
    <Table.Root>
      <Table.Header class="bg-muted/50">
        <Table.Row>
          <Table.Head class={th}>Nom</Table.Head>
          <Table.Head class={th}>Canal</Table.Head>
          <Table.Head class={th}>Campus</Table.Head>
          <Table.Head class={th}>Event</Table.Head>
          <Table.Head class={th}>Statut</Table.Head>
          <Table.Head class={th}>Progression</Table.Head>
          <Table.Head class={th}>Date</Table.Head>
          <Table.Head class={th}></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.broadcasts as b (b.id)}
          {@const total = b._count.recipients}
          <Table.Row class="hover:bg-muted/30">
            <Table.Cell class="font-medium">{b.name}</Table.Cell>
            <Table.Cell>
              <span class="inline-flex items-center gap-1">
                {#if b.channel === 'mail'}
                  <Mail class="h-3.5 w-3.5" />
                {:else}
                  <MessageSquare class="h-3.5 w-3.5" />
                {/if}
                {BROADCAST_CHANNEL_LABELS[b.channel]}
              </span>
            </Table.Cell>
            <Table.Cell class="text-muted-foreground"
              >{b.campus.name}</Table.Cell
            >
            <Table.Cell class="text-muted-foreground"
              >{b.event?.titre ?? '—'}</Table.Cell
            >
            <Table.Cell>
              <span
                class="rounded px-2 py-0.5 text-xs font-medium {STATUS_STYLE[
                  b.status
                ]}"
              >
                {STATUS_LABEL[b.status]}
              </span>
            </Table.Cell>
            <Table.Cell class="text-xs text-muted-foreground">
              {b.progress.sent}/{total} envoyés
              {#if b.progress.failed > 0}
                <span class="text-destructive">· {b.progress.failed} échec</span
                >
              {/if}
              {#if b.progress.opened > 0}
                <span>· {b.progress.opened} ouvert</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="text-muted-foreground">
              {formatter.format(b.createdAt)}
            </Table.Cell>
            <Table.Cell class="text-right">
              <Button
                variant="ghost"
                size="sm"
                href={resolve(`/staff/admin/broadcasts/${b.id}`)}
              >
                Détail
              </Button>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}
