<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import Plus from '@lucide/svelte/icons/plus';
  import Send from '@lucide/svelte/icons/send';
  import Eye from '@lucide/svelte/icons/eye';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CircleCheckBig from '@lucide/svelte/icons/circle-check-big';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import BroadcastStatusBadge from '$lib/components/admin/broadcasts/BroadcastStatusBadge.svelte';
  import ChannelBadge from '$lib/components/admin/broadcasts/ChannelBadge.svelte';

  let { data } = $props();

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  function pct(v: number | null): string {
    return v == null ? '—' : `${Math.round(v)} %`;
  }

  const th = 'text-xs uppercase';
</script>

{#snippet quickActions()}
  <Button variant="outline" href={resolve('/staff/admin/broadcasts/templates')}>
    Templates
  </Button>
  <Button href={resolve('/staff/admin/broadcasts/new')}>
    <Plus class="mr-1 h-4 w-4" /> Nouvel envoi
  </Button>
{/snippet}

{#snippet transactionalMeta()}
  <Button
    variant="outline"
    size="sm"
    href={resolve('/staff/admin/email-actions')}
  >
    Configurer
  </Button>
{/snippet}

{#snippet activityMeta()}
  <Button variant="ghost" size="sm" href={resolve('/staff/admin/broadcasts')}>
    Tous les envois <ArrowRight class="ml-1 h-3.5 w-3.5" />
  </Button>
{/snippet}

<div class="space-y-6">
  <PageHeader
    title="Communication"
    accent="globale"
    subtitle="Tous les envois sortants, en un coup d'œil"
    actions={quickActions}
  />

  <!-- Headline KPIs (30-day window) -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <KpiTile
      label="Envois"
      value={data.broadcasts.totals.broadcasts}
      sub="30 derniers jours"
      icon={Send}
      tone="blue"
      href={resolve('/staff/admin/broadcasts')}
    />
    <KpiTile
      label="Taux d'ouverture"
      value={pct(data.broadcasts.totals.openRate)}
      progress={data.broadcasts.totals.openRate ?? undefined}
      icon={Eye}
      tone="teal"
      helpText="Mails ouverts / mails envoyés (le SMS n'est pas suivi)"
    />
    <KpiTile
      label="Échecs"
      value={data.broadcasts.totals.failed}
      sub="30 derniers jours"
      icon={TriangleAlert}
      tone="orange"
    />
  </div>

  <!-- Transactional health -->
  <EpiSection
    overline="Mails automatiques"
    title="Santé transactionnelle"
    accent={data.transactional.healthy ? 'tech' : 'together'}
    meta={transactionalMeta}
  >
    {#if data.transactional.healthy}
      <div
        class="mb-4 flex items-start gap-3 rounded-sm border border-success/40 bg-success/10 p-3 text-sm text-success"
      >
        <CircleCheckBig class="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <p>Toutes les actions sont reliées à un template.</p>
      </div>
    {:else}
      <div
        class="mb-4 flex items-start gap-3 rounded-sm border-2 border-destructive bg-destructive/10 p-3 text-sm"
        role="alert"
      >
        <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <p>
          <strong>{data.transactional.missingCount}</strong> action{data
            .transactional.missingCount > 1
            ? 's'
            : ''} sans template — ces emails ne partent pas (login OTP inclus).
        </p>
      </div>
    {/if}

    <ul class="divide-y divide-border text-sm">
      {#each data.transactional.actions as a (a.key)}
        <li class="flex items-center justify-between gap-3 py-2">
          <span class="min-w-0 truncate font-medium">{a.label}</span>
          {#if a.mapped}
            <span
              class="flex shrink-0 items-center gap-1.5 text-muted-foreground"
            >
              <CircleCheckBig class="h-3.5 w-3.5 text-epi-tech-ink" />
              <span class="max-w-48 truncate text-xs">{a.templateName}</span>
            </span>
          {:else}
            <span
              class="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-destructive"
            >
              <TriangleAlert class="h-3.5 w-3.5" /> Non configuré
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  </EpiSection>

  <!-- Recent broadcast activity -->
  <EpiSection
    overline="Derniers envois"
    title="Activité récente"
    accent="blue"
    meta={activityMeta}
  >
    {#if data.recentBroadcasts.length === 0}
      <p class="text-sm text-muted-foreground">Aucun envoi pour le moment.</p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head class={th}>Nom</Table.Head>
              <Table.Head class={th}>Canal</Table.Head>
              <Table.Head class={th}>Campus</Table.Head>
              <Table.Head class={th}>Statut</Table.Head>
              <Table.Head class={th}>Envoyés</Table.Head>
              <Table.Head class={th}>Date</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data.recentBroadcasts as b (b.id)}
              <Table.Row
                class="cursor-pointer hover:bg-muted/30"
                onclick={() => goto(resolve(`/staff/admin/broadcasts/${b.id}`))}
              >
                <Table.Cell class="font-medium">{b.name}</Table.Cell>
                <Table.Cell><ChannelBadge channel={b.channel} /></Table.Cell>
                <Table.Cell class="text-muted-foreground"
                  >{b.campusName}</Table.Cell
                >
                <Table.Cell
                  ><BroadcastStatusBadge status={b.status} /></Table.Cell
                >
                <Table.Cell class="text-xs text-muted-foreground">
                  {b.sent}/{b.recipients}
                  {#if b.opened > 0}<span>· {b.opened} ouvert</span>{/if}
                </Table.Cell>
                <Table.Cell class="text-muted-foreground">
                  {dateFmt.format(b.createdAt)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </EpiSection>
</div>
