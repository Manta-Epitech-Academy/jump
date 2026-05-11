<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import {
    BROADCAST_AUDIENCE_LABELS,
    BROADCAST_CHANNEL_LABELS,
  } from '$lib/domain/broadcasts';
  import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
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

  function recipientName(r: (typeof data.recipients)[number]): string {
    if (r.talent) return `${r.talent.prenom} ${r.talent.nom}`.trim();
    if (r.parentOf)
      return (
        `${r.parentOf.parentPrenom ?? ''} ${r.parentOf.parentNom ?? ''}`.trim() ||
        `parent de ${r.parentOf.prenom} ${r.parentOf.nom}`
      );
    if (r.staffUser?.name) return r.staffUser.name;
    return '—';
  }

  function recipientRole(r: (typeof data.recipients)[number]): string {
    if (r.parentOf) return 'parent';
    if (r.staffUser) return 'staff';
    return 'talent';
  }
</script>

<div class="space-y-4">
  <Button variant="ghost" size="sm" href={resolve('/staff/admin/broadcasts')}>
    <ArrowLeft class="mr-1 h-4 w-4" /> Retour aux envois
  </Button>

  <header class="space-y-1">
    <h2 class="text-xl font-bold">{data.broadcast.name}</h2>
    <p class="text-sm text-muted-foreground">
      {BROADCAST_CHANNEL_LABELS[data.broadcast.channel]} · {BROADCAST_AUDIENCE_LABELS[
        data.broadcast.audience
      ]}
      · {data.broadcast.campus.name}
      {#if data.broadcast.event}
        · {data.broadcast.event.titre}
      {/if}
      · Créé le {formatter.format(data.broadcast.createdAt)} par {data.broadcast
        .createdBy?.name ?? data.broadcast.createdBy?.email}
    </p>
  </header>

  <div class="grid gap-3 md:grid-cols-5">
    <div class="rounded-lg border bg-muted/30 p-3">
      <p class="text-[10px] tracking-widest text-muted-foreground uppercase">
        Statut
      </p>
      <p class="font-semibold">{STATUS_LABEL[data.broadcast.status]}</p>
    </div>
    <div class="rounded-lg border bg-muted/30 p-3">
      <p class="text-[10px] tracking-widest text-muted-foreground uppercase">
        Total
      </p>
      <p class="text-lg font-bold">{data.broadcast._count.recipients}</p>
    </div>
    <div class="rounded-lg border bg-muted/30 p-3">
      <p class="text-[10px] tracking-widest text-muted-foreground uppercase">
        Envoyés
      </p>
      <p class="text-lg font-bold text-emerald-600">{data.stats.sent}</p>
    </div>
    <div class="rounded-lg border bg-muted/30 p-3">
      <p class="text-[10px] tracking-widest text-muted-foreground uppercase">
        Échecs
      </p>
      <p class="text-lg font-bold text-destructive">{data.stats.failed}</p>
    </div>
    <div class="rounded-lg border bg-muted/30 p-3">
      <p class="text-[10px] tracking-widest text-muted-foreground uppercase">
        Ouverts
      </p>
      <p class="text-lg font-bold">{data.stats.opened}</p>
    </div>
  </div>

  <details class="rounded-lg border bg-muted/20 p-4 text-sm">
    <summary class="cursor-pointer font-medium"
      >Contenu envoyé (snapshot)</summary
    >
    <div class="mt-3 space-y-2">
      {#if data.broadcast.subjectSnapshot}
        <p class="text-xs">
          <span class="font-semibold">Sujet : </span>{data.broadcast
            .subjectSnapshot}
        </p>
      {/if}
      {#if data.broadcast.channel === 'mail'}
        <div class="overflow-hidden rounded border">
          {@html renderBroadcastMail(data.broadcast.bodySnapshot)}
        </div>
      {:else}
        <pre
          class="rounded border bg-white p-3 text-xs whitespace-pre-wrap text-slate-800 dark:bg-slate-900 dark:text-slate-200">{data
            .broadcast.bodySnapshot}</pre>
      {/if}
    </div>
  </details>

  <div class="overflow-hidden rounded-lg border">
    <table class="w-full text-sm">
      <thead class="border-b bg-muted/50 text-left text-xs uppercase">
        <tr>
          <th class="px-4 py-2">Destinataire</th>
          <th class="px-4 py-2">Rôle</th>
          <th class="px-4 py-2">Contact</th>
          <th class="px-4 py-2">Statut</th>
          <th class="px-4 py-2">Envoyé</th>
          <th class="px-4 py-2">Ouvert</th>
          <th class="px-4 py-2">Erreur</th>
        </tr>
      </thead>
      <tbody>
        {#each data.recipients as r (r.id)}
          <tr class="border-b last:border-b-0 hover:bg-muted/30">
            <td class="px-4 py-2 font-medium">{recipientName(r)}</td>
            <td class="px-4 py-2 text-xs text-muted-foreground"
              >{recipientRole(r)}</td
            >
            <td class="px-4 py-2 text-xs text-muted-foreground">
              {r.recipientEmail ?? r.recipientPhone ?? '—'}
            </td>
            <td class="px-4 py-2 text-xs">{r.status}</td>
            <td class="px-4 py-2 text-xs text-muted-foreground">
              {r.sentAt ? formatter.format(r.sentAt) : '—'}
            </td>
            <td class="px-4 py-2 text-xs text-muted-foreground">
              {r.openedAt ? formatter.format(r.openedAt) : '—'}
            </td>
            <td class="px-4 py-2 text-xs text-destructive">
              {r.errorMessage ?? ''}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
