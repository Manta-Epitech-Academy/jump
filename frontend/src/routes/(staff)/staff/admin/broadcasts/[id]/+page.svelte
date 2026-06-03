<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Users from '@lucide/svelte/icons/users';
  import Send from '@lucide/svelte/icons/send';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Eye from '@lucide/svelte/icons/eye';
  import Activity from '@lucide/svelte/icons/activity';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import BroadcastStatusBadge from '$lib/components/admin/broadcasts/BroadcastStatusBadge.svelte';
  import ChannelBadge from '$lib/components/admin/broadcasts/ChannelBadge.svelte';
  import RecipientStatusBadge from '$lib/components/admin/broadcasts/RecipientStatusBadge.svelte';
  import { BROADCAST_AUDIENCE_LABELS } from '$lib/domain/broadcasts';
  import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';

  let { data } = $props();

  const totalPages = $derived(
    Math.max(1, Math.ceil(data.recipientsTotal / data.recipientsPageSize)),
  );

  function goToPage(p: number) {
    const url = new URL(page.url);
    if (p <= 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(p));
    goto(url.toString(), { keepFocus: true, noScroll: false });
  }

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const total = $derived(data.broadcast._count.recipients);
  // Delivery = sent / total; open rate = opened / sent (mail only). Guard /0.
  const sentPct = $derived(total > 0 ? (data.stats.sent / total) * 100 : 0);
  const openPct = $derived(
    data.stats.sent > 0 ? (data.stats.opened / data.stats.sent) * 100 : 0,
  );

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

  const th = 'text-xs uppercase';
</script>

{#snippet statusValue()}
  <BroadcastStatusBadge status={data.broadcast.status} />
{/snippet}

<div class="space-y-5">
  <Button variant="ghost" size="sm" href={resolve('/staff/admin/broadcasts')}>
    <ArrowLeft class="mr-1 h-4 w-4" /> Retour aux envois
  </Button>

  <AdminPageHeader title={data.broadcast.name} />
  <div
    class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
  >
    <ChannelBadge channel={data.broadcast.channel} />
    <span aria-hidden="true">·</span>
    <span>{BROADCAST_AUDIENCE_LABELS[data.broadcast.audience]}</span>
    <span aria-hidden="true">·</span>
    <span>{data.broadcast.campus.name}</span>
    {#if data.broadcast.event}
      <span aria-hidden="true">·</span>
      <span>{data.broadcast.event.titre}</span>
    {/if}
    <span aria-hidden="true">·</span>
    <span>
      Créé le {formatter.format(data.broadcast.createdAt)} par {data.broadcast
        .createdBy?.name ?? data.broadcast.createdBy?.email}
    </span>
  </div>

  <div class="grid gap-3 md:grid-cols-5">
    <KpiTile
      label="Statut"
      valueSnippet={statusValue}
      icon={Activity}
      tone="neutral"
    />
    <KpiTile label="Total" value={total} icon={Users} tone="blue" />
    <KpiTile
      label="Envoyés"
      value={data.stats.sent}
      icon={Send}
      tone="teal"
      progress={sentPct}
    />
    <KpiTile
      label="Échecs"
      value={data.stats.failed}
      icon={TriangleAlert}
      tone="orange"
    />
    <KpiTile
      label="Ouverts"
      value={data.stats.opened}
      icon={Eye}
      tone="blue"
      progress={data.broadcast.channel === 'mail' ? openPct : undefined}
      helpText={data.broadcast.channel === 'mail'
        ? 'Ont cliqué sur ≥ 1 lien tracké'
        : "Le suivi d'ouverture ne s'applique pas au SMS"}
    />
  </div>

  <details class="rounded-sm border bg-muted/20 p-4 text-sm">
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
        <div class="overflow-hidden rounded-sm border">
          {@html renderBroadcastMail(data.broadcast.bodySnapshot)}
        </div>
      {:else}
        <pre
          class="rounded-sm border bg-white p-3 text-xs whitespace-pre-wrap text-slate-800 dark:bg-slate-900 dark:text-slate-200">{data
            .broadcast.bodySnapshot}</pre>
      {/if}
    </div>
  </details>

  <div class="flex items-center justify-between text-xs text-muted-foreground">
    <span>
      Destinataires {(data.recipientsPage - 1) * data.recipientsPageSize +
        1}–{Math.min(
        data.recipientsPage * data.recipientsPageSize,
        data.recipientsTotal,
      )}
      sur {data.recipientsTotal}
    </span>
    {#if totalPages > 1}
      <div class="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="rounded-sm"
          disabled={data.recipientsPage <= 1}
          onclick={() => goToPage(data.recipientsPage - 1)}
        >
          ← Précédent
        </Button>
        <span class="self-center text-xs">
          Page {data.recipientsPage} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="rounded-sm"
          disabled={data.recipientsPage >= totalPages}
          onclick={() => goToPage(data.recipientsPage + 1)}
        >
          Suivant →
        </Button>
      </div>
    {/if}
  </div>

  <div class="overflow-hidden rounded-sm border">
    <Table.Root>
      <Table.Header class="bg-muted/50">
        <Table.Row>
          <Table.Head class={th}>Destinataire</Table.Head>
          <Table.Head class={th}>Rôle</Table.Head>
          <Table.Head class={th}>Contact</Table.Head>
          <Table.Head class={th}>Statut</Table.Head>
          <Table.Head class={th}>Envoyé</Table.Head>
          <Table.Head class={th}>Ouvert</Table.Head>
          <Table.Head class={th}>Erreur</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.recipients as r (r.id)}
          <Table.Row class="hover:bg-muted/30">
            <Table.Cell class="font-medium">{recipientName(r)}</Table.Cell>
            <Table.Cell class="text-xs text-muted-foreground"
              >{recipientRole(r)}</Table.Cell
            >
            <Table.Cell class="text-xs text-muted-foreground">
              {r.recipientEmail ?? r.recipientPhone ?? '—'}
            </Table.Cell>
            <Table.Cell><RecipientStatusBadge status={r.status} /></Table.Cell>
            <Table.Cell class="text-xs text-muted-foreground">
              {r.sentAt ? formatter.format(r.sentAt) : '—'}
            </Table.Cell>
            <Table.Cell class="text-xs text-muted-foreground">
              {r.openedAt ? formatter.format(r.openedAt) : '—'}
            </Table.Cell>
            <Table.Cell class="text-xs text-destructive">
              {r.errorMessage ?? ''}
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
