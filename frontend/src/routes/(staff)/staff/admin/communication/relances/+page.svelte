<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Lock from '@lucide/svelte/icons/lock';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';

  let { data } = $props();

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const totalPages = $derived(
    Math.max(1, Math.ceil(data.mirror.total / data.mirror.pageSize)),
  );

  // Filters live in the URL so they survive reloads and the load re-runs
  // server-side. Changing a filter resets pagination to page 1.
  function setParam(key: string, value: string) {
    const url = new URL(page.url);
    if (value === 'all') url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    url.searchParams.delete('page');
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  function goToPage(p: number) {
    const url = new URL(page.url);
    if (p <= 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(p));
    goto(url.toString(), { keepFocus: true });
  }

  const channelOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'email', label: 'Email' },
    { value: 'sms', label: 'SMS' },
  ];
  const typeOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'student', label: 'Étudiant' },
    { value: 'parent', label: 'Parent' },
  ];

  const th = 'text-xs uppercase';

  function typeLabel(t: string): string {
    return t === 'parent' ? 'Parent' : 'Étudiant';
  }

  function senderLabel(
    s: { name: string | null; email: string | null } | null,
  ): string {
    return s?.name ?? s?.email ?? '—';
  }
</script>

<div class="space-y-5">
  <Button
    variant="ghost"
    size="sm"
    href={resolve('/staff/admin/communication')}
  >
    <ArrowLeft class="mr-1 h-4 w-4" /> Vue d'ensemble
  </Button>

  <AdminPageHeader
    title="Relances"
    accent="lecture seule"
    subtitle="Historique consolidé des relances d'onboarding (email + SMS)"
  />

  <div
    class="flex items-start gap-3 rounded-sm border border-epi-pink/30 bg-epi-pink/5 p-3 text-sm"
  >
    <Lock class="mt-0.5 h-4 w-4 shrink-0 text-epi-pink" />
    <p class="text-muted-foreground">
      Vue consolidée en <strong>lecture seule</strong>. Pour envoyer une
      relance, passez par l'espace Dev (fiche talent ou onboarding d'un event).
    </p>
  </div>

  <!-- 30-day stats -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <div class="rounded-sm border bg-muted/30 p-3">
      <p
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Total (30j)
      </p>
      <p class="text-2xl font-black">{data.stats.total}</p>
    </div>
    <div class="rounded-sm border bg-muted/30 p-3">
      <p
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Email / SMS
      </p>
      <p class="text-2xl font-black">
        {data.stats.byChannel.email}<span class="text-muted-foreground"
          >/{data.stats.byChannel.sms}</span
        >
      </p>
    </div>
    <div class="rounded-sm border bg-muted/30 p-3">
      <p
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Étudiant / Parent
      </p>
      <p class="text-2xl font-black">
        {data.stats.byType.student}<span class="text-muted-foreground"
          >/{data.stats.byType.parent}</span
        >
      </p>
    </div>
    <div class="rounded-sm border bg-muted/30 p-3">
      <p
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Dernière relance
      </p>
      <p class="text-sm font-bold">
        {data.stats.lastSentAt ? dateFmt.format(data.stats.lastSentAt) : '—'}
      </p>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3">
    <SegmentedFilter
      options={channelOptions}
      value={data.filters.channel}
      onChange={(v) => setParam('channel', v)}
      ariaLabel="Filtrer par canal"
    />
    <SegmentedFilter
      options={typeOptions}
      value={data.filters.type}
      onChange={(v) => setParam('type', v)}
      ariaLabel="Filtrer par destinataire"
    />
  </div>

  <div class="flex items-center justify-between text-xs text-muted-foreground">
    <span>
      {#if data.mirror.total > 0}
        {(data.mirror.page - 1) * data.mirror.pageSize + 1}–{Math.min(
          data.mirror.page * data.mirror.pageSize,
          data.mirror.total,
        )}
        sur {data.mirror.total}
      {:else}
        Aucune relance
      {/if}
    </span>
    {#if totalPages > 1}
      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="rounded-sm"
          disabled={data.mirror.page <= 1}
          onclick={() => goToPage(data.mirror.page - 1)}
        >
          ← Précédent
        </Button>
        <span class="self-center text-xs">
          Page {data.mirror.page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="rounded-sm"
          disabled={data.mirror.page >= totalPages}
          onclick={() => goToPage(data.mirror.page + 1)}
        >
          Suivant →
        </Button>
      </div>
    {/if}
  </div>

  {#if data.mirror.rows.length === 0}
    <div
      class="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground"
    >
      Aucune relance ne correspond à ces filtres.
    </div>
  {:else}
    <div class="overflow-hidden rounded-sm border">
      <Table.Root>
        <Table.Header class="bg-muted/50">
          <Table.Row>
            <Table.Head class={th}>Date</Table.Head>
            <Table.Head class={th}>Talent</Table.Head>
            <Table.Head class={th}>Destinataire</Table.Head>
            <Table.Head class={th}>Canal</Table.Head>
            <Table.Head class={th}>Sujet</Table.Head>
            <Table.Head class={th}>Envoyé par</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.mirror.rows as r (r.id)}
            <Table.Row class="hover:bg-muted/30">
              <Table.Cell class="text-muted-foreground">
                {dateFmt.format(r.sentAt)}
              </Table.Cell>
              <Table.Cell class="font-medium">
                {r.talent.prenom}
                {r.talent.nom}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground"
                >{typeLabel(r.type)}</Table.Cell
              >
              <Table.Cell>
                <span
                  class="inline-flex items-center gap-1 text-muted-foreground"
                >
                  {#if r.channel === 'sms'}
                    <MessageSquare class="h-3.5 w-3.5" /> SMS
                  {:else}
                    <Mail class="h-3.5 w-3.5" /> Email
                  {/if}
                </span>
              </Table.Cell>
              <Table.Cell
                class="max-w-xs truncate text-muted-foreground"
                title={r.subject ?? ''}
              >
                {r.subject ?? '—'}
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {senderLabel(r.sender)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}
</div>
