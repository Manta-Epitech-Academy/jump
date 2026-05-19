<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
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
    <table class="w-full text-sm">
      <thead class="border-b bg-muted/50 text-left text-xs uppercase">
        <tr>
          <th class="px-4 py-2">Nom</th>
          <th class="px-4 py-2">Canal</th>
          <th class="px-4 py-2">Campus</th>
          <th class="px-4 py-2">Event</th>
          <th class="px-4 py-2">Statut</th>
          <th class="px-4 py-2">Progression</th>
          <th class="px-4 py-2">Date</th>
          <th class="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each data.broadcasts as b (b.id)}
          {@const total = b._count.recipients}
          <tr class="border-b last:border-b-0 hover:bg-muted/30">
            <td class="px-4 py-2 font-medium">{b.name}</td>
            <td class="px-4 py-2">
              <span class="inline-flex items-center gap-1">
                {#if b.channel === 'mail'}
                  <Mail class="h-3.5 w-3.5" />
                {:else}
                  <MessageSquare class="h-3.5 w-3.5" />
                {/if}
                {BROADCAST_CHANNEL_LABELS[b.channel]}
              </span>
            </td>
            <td class="px-4 py-2 text-muted-foreground">{b.campus.name}</td>
            <td class="px-4 py-2 text-muted-foreground"
              >{b.event?.titre ?? '—'}</td
            >
            <td class="px-4 py-2">
              <span
                class="rounded px-2 py-0.5 text-xs font-medium {STATUS_STYLE[
                  b.status
                ]}"
              >
                {STATUS_LABEL[b.status]}
              </span>
            </td>
            <td class="px-4 py-2 text-xs text-muted-foreground">
              {b.progress.sent}/{total} envoyés
              {#if b.progress.failed > 0}
                <span class="text-destructive">· {b.progress.failed} échec</span
                >
              {/if}
              {#if b.progress.opened > 0}
                <span>· {b.progress.opened} ouvert</span>
              {/if}
            </td>
            <td class="px-4 py-2 text-muted-foreground">
              {formatter.format(b.createdAt)}
            </td>
            <td class="px-4 py-2 text-right">
              <Button
                variant="ghost"
                size="sm"
                href={resolve(`/staff/admin/broadcasts/${b.id}`)}
              >
                Détail
              </Button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
