<script lang="ts">
  import FileText from '@lucide/svelte/icons/file-text';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import Layers from '@lucide/svelte/icons/layers';
  import Clock from '@lucide/svelte/icons/clock';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { enhance } from '$app/forms';
  import { goto, invalidate } from '$app/navigation';
  import { page } from '$app/state';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import * as Table from '$lib/components/ui/table';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import { cn, formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import ExportMenu from './components/ExportMenu.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import CodeTag from '$lib/components/layout/CodeTag.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data } = $props();

  const documentTypeLabels: Record<string, string> = {
    rules: 'Règlement intérieur',
    charter: 'Charte',
    'image-rights': "Droit à l'image",
  };

  const documentTypeFilterOptions = [
    { value: 'all', label: 'Tous les documents' },
    ...Object.entries(documentTypeLabels).map(([value, label]) => ({
      value,
      label,
    })),
  ];

  const statusLabels: Record<string, string> = {
    pending: 'En attente',
    processing: 'En cours',
    success: 'Succès',
    error: 'Erreur',
  };

  function statusVariant(
    status: string,
  ): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'success') return 'secondary';
    if (status === 'error') return 'destructive';
    if (status === 'processing') return 'default';
    return 'outline';
  }

  const inFlight = $derived(
    data.countByStatus.pending + data.countByStatus.processing,
  );
  const total = $derived(
    data.countByStatus.pending +
      data.countByStatus.processing +
      data.countByStatus.success +
      data.countByStatus.error,
  );
  const hasFilters = $derived(
    data.filters.status !== 'all' ||
      data.filters.type !== 'all' ||
      data.filters.q !== '',
  );

  // Status tiles double as the primary filter — the summary you read and the
  // control you click are the same object. Same KpiTile as the dev event
  // onboarding cockpit, so the chrome reads consistently across staff.
  const cards = [
    {
      key: 'all',
      label: 'Tous',
      caption: 'Toutes les tâches',
      tone: 'neutral',
      Icon: Layers,
    },
    {
      key: 'active',
      label: 'En cours',
      caption: 'Génération en arrière-plan',
      tone: 'blue',
      Icon: Clock,
    },
    {
      key: 'success',
      label: 'Succès',
      caption: 'PDF générés et uploadés',
      tone: 'teal',
      Icon: CircleCheck,
    },
    {
      key: 'error',
      label: 'Erreurs',
      caption: 'Échecs — relançables',
      tone: 'orange',
      Icon: TriangleAlert,
    },
  ] as const;

  function cardValue(key: string): number {
    if (key === 'all') return total;
    if (key === 'active') return inFlight;
    if (key === 'success') return data.countByStatus.success;
    return data.countByStatus.error;
  }

  function navigateWithParams(params: Record<string, string>) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  let searchQuery = $state(page.url.searchParams.get('q') ?? '');
  let searchTimeout: ReturnType<typeof setTimeout>;
  function handleSearchInput(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(
      () => navigateWithParams({ q: searchQuery.trim() }),
      300,
    );
  }

  function clearFilters() {
    searchQuery = '';
    goto(page.url.pathname, { keepFocus: true, noScroll: true });
  }

  // Live feed: jobs move pending → processing → success within seconds, so poll
  // this load's data (not the whole layout) while the tab is visible. Cheap
  // query; 5s keeps the queue feeling live without hammering the DB.
  const th = 'font-mono text-xs font-normal uppercase tracking-wider';
  // Poll only while jobs are in flight: once the queue settles (inFlight === 0)
  // there is nothing to refresh, so an idle page stops hitting the DB every 5s.
  // The effect re-reads inFlight, so it re-arms automatically if a reload brings
  // the count back above 0.
  $effect(() => {
    if (inFlight === 0) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible')
        invalidate('admin:onboarding-pdfs');
    }, 5000);
    return () => clearInterval(id);
  });

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.round(diff / 1000);
    if (s < 5) return "à l'instant";
    if (s < 60) return `il y a ${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    return formatDateTimeFr(iso);
  }
</script>

<svelte:head>
  <title>Génération PDF onboarding</title>
</svelte:head>

{#snippet timeCell(iso: string | null)}
  {#if iso}
    <span
      class="font-mono text-xs text-muted-foreground"
      title={formatDateTimeFr(iso)}
    >
      {relativeTime(iso)}
    </span>
  {:else}
    <span class="font-mono text-xs text-muted-foreground">—</span>
  {/if}
{/snippet}

<div class="space-y-6">
  <PageHeader
    title="Génération PDF Onboarding"
    accroche="Générés en arrière-plan dès la signature"
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        {#if inFlight > 0}
          <span
            class="flex items-center gap-1.5 font-mono text-[0.7rem] tracking-widest text-epi-blue uppercase"
          >
            <span class="relative flex h-2 w-2">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-epi-blue opacity-75"
              ></span>
              <span
                class="relative inline-flex h-2 w-2 rounded-full bg-epi-blue"
              ></span>
            </span>
            En direct
          </span>
        {/if}

        {#if data.errorCount > 0}
          <form
            method="POST"
            action="?/retryAll"
            use:enhance={() =>
              async ({ result, update }) => {
                if (result.type === 'success') {
                  toast.success(
                    `${data.errorCount} génération${data.errorCount > 1 ? 's' : ''} relancée${data.errorCount > 1 ? 's' : ''}`,
                  );
                  await update();
                } else {
                  toast.error('Une erreur est survenue');
                }
              }}
          >
            <Button type="submit" variant="outline" class="gap-2">
              <RotateCcw class="h-4 w-4" />
              Tout relancer ({data.errorCount})
            </Button>
          </form>
        {/if}

        {#if data.countByStatus.success > 0}
          <ExportMenu lastExportAt={data.lastExportAt} />
        {/if}
      </div>
    {/snippet}
  </PageHeader>

  <!-- Status tiles = filter toggles -->
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {#each cards as card (card.key)}
      <KpiTile
        label={card.label}
        value={cardValue(card.key)}
        sub={card.caption}
        icon={card.Icon}
        tone={card.tone}
        onclick={() => navigateWithParams({ status: card.key })}
        pressed={data.filters.status === card.key}
      />
    {/each}
  </div>

  <Card.Root class="shadow-none">
    <Card.Header class="gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Card.Title class="flex items-center gap-2 tracking-wide uppercase">
          <FileText class="h-4 w-4 text-epi-blue" />
          Tâches
          <span class="font-mono text-xs font-normal text-muted-foreground">
            ({data.matchCount}{data.truncated ? ' · 100 affichées' : ''})
          </span>
        </Card.Title>

        <div class="flex flex-wrap items-center gap-2">
          <div class="relative">
            <Search
              class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Rechercher un talent…"
              value={searchQuery}
              oninput={handleSearchInput}
              class="h-9 w-56 rounded-sm pl-8"
            />
          </div>

          <FilterSelect
            options={documentTypeFilterOptions}
            value={data.filters.type}
            onChange={(v) => navigateWithParams({ type: v })}
            ariaLabel="Filtrer par document"
            triggerClass="text-xs"
          />

          {#if hasFilters}
            <Button
              variant="ghost"
              size="sm"
              class="gap-1.5 text-muted-foreground"
              onclick={clearFilters}
            >
              <X class="h-3.5 w-3.5" />
              Réinitialiser
            </Button>
          {/if}
        </div>
      </div>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head class={th}>Statut</Table.Head>
            <Table.Head class={th}>Talent</Table.Head>
            <Table.Head class={th}>Document</Table.Head>
            <Table.Head class={th}>Créée</Table.Head>
            <Table.Head class={th}>Traitée</Table.Head>
            <Table.Head class={th}>Détails</Table.Head>
            <Table.Head class={cn(th, 'text-right')}>Action</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.jobs as job (job.id)}
            <Table.Row>
              <Table.Cell>
                <Badge
                  variant={statusVariant(job.status)}
                  class="gap-1 rounded-sm font-mono text-[0.7rem] tracking-wide uppercase"
                >
                  {#if job.status === 'processing' && !job.retryable}
                    <LoaderCircle class="h-3 w-3 animate-spin" />
                  {/if}
                  {statusLabels[job.status] ?? job.status}
                </Badge>
              </Table.Cell>
              <Table.Cell class="font-medium">
                {job.talent?.name ?? '—'}
              </Table.Cell>
              <Table.Cell>
                {documentTypeLabels[job.documentType] ?? job.documentType}
              </Table.Cell>
              <Table.Cell>{@render timeCell(job.createdAt)}</Table.Cell>
              <Table.Cell>{@render timeCell(job.processedAt)}</Table.Cell>
              <Table.Cell class="max-w-md">
                {#if job.status === 'error' && job.errorMessage}
                  <span class="font-mono text-xs text-destructive">
                    {job.errorMessage}
                  </span>
                {:else if job.status === 'success' && job.filePath}
                  <form
                    method="POST"
                    action="?/view"
                    class="inline"
                    use:enhance={() =>
                      async ({ result }) => {
                        if (result.type === 'success' && result.data?.url) {
                          window.open(
                            result.data.url as string,
                            '_blank',
                            'noopener',
                          );
                        } else {
                          toast.error("Impossible d'ouvrir le PDF");
                        }
                      }}
                  >
                    <input type="hidden" name="id" value={job.id} />
                    <Button
                      type="submit"
                      variant="link"
                      size="sm"
                      class="h-auto gap-1.5 p-0 text-xs text-epi-blue"
                    >
                      <ExternalLink class="h-3.5 w-3.5" />
                      Voir le PDF
                    </Button>
                  </form>
                {:else}
                  <span class="text-xs text-muted-foreground">—</span>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right">
                {#if job.retryable}
                  <form
                    method="POST"
                    action="?/retry"
                    use:enhance={() =>
                      async ({ result, update }) => {
                        if (result.type === 'success') {
                          toast.success('Génération relancée');
                          await update();
                        } else {
                          toast.error('Une erreur est survenue');
                        }
                      }}
                  >
                    <input type="hidden" name="id" value={job.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      class="gap-1.5"
                    >
                      <RotateCcw class="h-3.5 w-3.5" />
                      Relancer
                    </Button>
                  </form>
                {/if}
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={7} class="py-12 text-center">
                {#if hasFilters}
                  <p class="font-mono text-xs text-muted-foreground">
                    <CodeTag>Aucune tâche pour ce filtre</CodeTag>
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    class="mt-1 text-epi-blue"
                    onclick={clearFilters}
                  >
                    Réinitialiser les filtres
                  </Button>
                {:else}
                  <p class="font-mono text-xs text-muted-foreground">
                    <CodeTag>Aucune tâche enregistrée</CodeTag>
                  </p>
                {/if}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</div>
