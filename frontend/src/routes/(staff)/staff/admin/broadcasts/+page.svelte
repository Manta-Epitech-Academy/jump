<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Table from '$lib/components/ui/table';
  import Plus from '@lucide/svelte/icons/plus';
  import Send from '@lucide/svelte/icons/send';
  import MailCheck from '@lucide/svelte/icons/mail-check';
  import Eye from '@lucide/svelte/icons/eye';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Search from '@lucide/svelte/icons/search';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import BroadcastStatusBadge from '$lib/components/admin/broadcasts/BroadcastStatusBadge.svelte';
  import ChannelBadge from '$lib/components/admin/broadcasts/ChannelBadge.svelte';
  import {
    BROADCAST_STATUS_LABELS,
    BROADCAST_CHANNEL_LABELS,
  } from '$lib/domain/broadcasts';
  import type { BroadcastChannel, BroadcastStatus } from '@prisma/client';

  let { data } = $props();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  function pct(v: number | null): string {
    return v == null ? '—' : `${Math.round(v)} %`;
  }

  // ── Client-side filtering over the 50 most recent sends ──────────────────
  let q = $state('');
  let channelFilter = $state<'all' | BroadcastChannel>('all');
  let statusFilter = $state<'all' | BroadcastStatus>('all');

  const channelCounts = $derived({
    mail: data.broadcasts.filter((b) => b.channel === 'mail').length,
    sms: data.broadcasts.filter((b) => b.channel === 'sms').length,
  });

  const channelOptions = $derived([
    { value: 'all', label: 'Tous', count: data.broadcasts.length },
    {
      value: 'mail',
      label: BROADCAST_CHANNEL_LABELS.mail,
      count: channelCounts.mail,
    },
    {
      value: 'sms',
      label: BROADCAST_CHANNEL_LABELS.sms,
      count: channelCounts.sms,
    },
  ]);

  const statusOptions = [
    { value: 'all', label: 'Tous' },
    ...(
      [
        'queued',
        'sending',
        'sent',
        'partial_failed',
        'failed',
      ] as BroadcastStatus[]
    ).map((s) => ({ value: s, label: BROADCAST_STATUS_LABELS[s] })),
  ];

  const filtered = $derived(
    data.broadcasts.filter((b) => {
      if (channelFilter !== 'all' && b.channel !== channelFilter) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      const needle = q.trim().toLowerCase();
      if (needle && !b.name.toLowerCase().includes(needle)) return false;
      return true;
    }),
  );

  const th = 'text-xs uppercase';
</script>

{#snippet newBroadcast()}
  <Button href={resolve('/staff/admin/broadcasts/new')}>
    <Plus class="mr-1 h-4 w-4" /> Nouvel envoi
  </Button>
{/snippet}

<div class="space-y-6">
  <AdminPageHeader
    title="Envoi"
    accent="en masse"
    subtitle="Mail / SMS ciblés aux talents, parents ou staff, et suivi d'acheminement"
    actions={newBroadcast}
  />

  <!-- 30-day headline stats -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <KpiTile
      label="Envois"
      value={data.stats.totals.broadcasts}
      sub="30 derniers jours"
      icon={Send}
      tone="blue"
    />
    <KpiTile
      label="Messages envoyés"
      value={data.stats.totals.sent}
      sub="30 derniers jours"
      icon={MailCheck}
      tone="teal"
    />
    <KpiTile
      label="Taux d'ouverture"
      value={pct(data.stats.totals.openRate)}
      progress={data.stats.totals.openRate ?? undefined}
      icon={Eye}
      tone="teal"
      helpText="Mails ouverts / mails envoyés (le SMS n'est pas suivi)"
    />
    <KpiTile
      label="Échecs"
      value={data.stats.totals.failed}
      sub="30 derniers jours"
      icon={TriangleAlert}
      tone="orange"
    />
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3">
    <div class="relative min-w-56 flex-1">
      <Search
        class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input bind:value={q} placeholder="Rechercher un envoi…" class="pl-8" />
    </div>
    <SegmentedFilter
      options={channelOptions}
      value={channelFilter}
      onChange={(v) => (channelFilter = v as 'all' | BroadcastChannel)}
      ariaLabel="Filtrer par canal"
    />
    <SegmentedFilter
      options={statusOptions}
      value={statusFilter}
      onChange={(v) => (statusFilter = v as 'all' | BroadcastStatus)}
      ariaLabel="Filtrer par statut"
    />
  </div>

  {#if data.broadcasts.length === 0}
    <div
      class="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground"
    >
      Aucun envoi pour le moment.
    </div>
  {:else if filtered.length === 0}
    <div
      class="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground"
    >
      Aucun envoi ne correspond à ces filtres.
    </div>
  {:else}
    <div class="overflow-hidden rounded-sm border">
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
          {#each filtered as b (b.id)}
            {@const total = b._count.recipients}
            {@const sentPct = total > 0 ? (b.progress.sent / total) * 100 : 0}
            <Table.Row class="hover:bg-muted/30">
              <Table.Cell class="font-medium">{b.name}</Table.Cell>
              <Table.Cell><ChannelBadge channel={b.channel} /></Table.Cell>
              <Table.Cell class="text-muted-foreground"
                >{b.campus.name}</Table.Cell
              >
              <Table.Cell class="text-muted-foreground">
                {b.event?.titre ?? '—'}
              </Table.Cell>
              <Table.Cell><BroadcastStatusBadge status={b.status} /></Table.Cell
              >
              <Table.Cell class="min-w-40">
                <div class="h-1.5 w-full overflow-hidden rounded-sm bg-muted">
                  <div
                    class="h-full bg-epi-teal-solid"
                    style="width: {sentPct}%"
                  ></div>
                </div>
                <p class="mt-1 text-[11px] text-muted-foreground">
                  {b.progress.sent}/{total} envoyés
                  {#if b.progress.failed > 0}
                    <span class="text-destructive"
                      >· {b.progress.failed} échec</span
                    >
                  {/if}
                  {#if b.progress.opened > 0}
                    <span>· {b.progress.opened} ouvert</span>
                  {/if}
                </p>
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
</div>
