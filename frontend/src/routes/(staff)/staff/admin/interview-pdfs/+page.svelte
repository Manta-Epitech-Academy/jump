<script lang="ts">
  import type { PageData } from './$types';
  import FileText from '@lucide/svelte/icons/file-text';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import Layers from '@lucide/svelte/icons/layers';
  import Laugh from '@lucide/svelte/icons/laugh';
  import Smile from '@lucide/svelte/icons/smile';
  import Meh from '@lucide/svelte/icons/meh';
  import Frown from '@lucide/svelte/icons/frown';
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import * as Table from '$lib/components/ui/table';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import { cn, formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import ExportMenu from './components/ExportMenu.svelte';
  import ResetInterviewDialog from './components/ResetInterviewDialog.svelte';

  let { data }: { data: PageData } = $props();

  type ResetTarget = {
    id: string;
    talentName: string;
    staffName: string;
    conductedAt: string;
  };
  let resetOpen = $state(false);
  let resetTarget = $state<ResetTarget | null>(null);

  function openReset(interview: ResetTarget) {
    resetTarget = interview;
    resetOpen = true;
  }

  const recoLabels: Record<string, string> = {
    tres_compatible: 'Compatible',
    bon_profil: 'A suivre',
    indecis: 'Indecis',
    pas_interesse: 'Pas interesse',
  };

  function recoVariant(
    reco: string | null,
  ): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (reco === 'tres_compatible') return 'default';
    if (reco === 'bon_profil') return 'secondary';
    if (reco === 'pas_interesse') return 'destructive';
    return 'outline';
  }

  const hasFilters = $derived(
    data.filters.reco !== 'all' || data.filters.q !== '',
  );

  const cards = [
    {
      key: 'all',
      label: 'Tous',
      caption: 'Entretiens finalises',
      tone: 'neutral',
      Icon: Layers,
    },
    {
      key: 'tres_compatible',
      label: 'Compatible',
      caption: '100% compatible',
      tone: 'teal',
      Icon: Laugh,
    },
    {
      key: 'bon_profil',
      label: 'A suivre',
      caption: 'Bon profil',
      tone: 'blue',
      Icon: Smile,
    },
    {
      key: 'indecis',
      label: 'Indecis',
      caption: 'A relancer',
      tone: 'orange',
      Icon: Meh,
    },
    {
      key: 'pas_interesse',
      label: 'Pas interesse',
      caption: 'Non motive',
      tone: 'pink',
      Icon: Frown,
    },
  ] as const;

  function cardValue(key: string): number {
    if (key === 'all') return data.totalDone;
    return data.recoCounts[key] ?? 0;
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

  const th = 'font-mono text-xs font-normal uppercase tracking-wider';
</script>

<svelte:head>
  <title>PDF Entretiens</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        PDF Entretiens<span class="text-epi-pink">_</span>
      </h1>
      <p class="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
        &lt;Synthese des entretiens de motivation/&gt;
      </p>
    </div>

    <div class="flex items-center gap-3">
      {#if data.exportTimeline.length > 0}
        <ExportMenu
          timeline={data.exportTimeline}
          lastExportAt={data.lastExportAt}
        />
      {/if}
    </div>
  </div>

  <!-- KPI tiles as filter toggles -->
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    {#each cards as card (card.key)}
      <KpiTile
        label={card.label}
        value={cardValue(card.key)}
        sub={card.caption}
        icon={card.Icon}
        tone={card.tone}
        onclick={() => navigateWithParams({ reco: card.key })}
        pressed={data.filters.reco === card.key}
      />
    {/each}
  </div>

  <Card.Root class="shadow-none">
    <Card.Header class="gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Card.Title class="flex items-center gap-2 tracking-wide uppercase">
          <FileText class="h-4 w-4 text-epi-blue" />
          Entretiens
          <span class="font-mono text-xs font-normal text-muted-foreground">
            ({data.matchCount}{data.truncated ? ' - 100 affichees' : ''})
          </span>
        </Card.Title>

        <div class="flex flex-wrap items-center gap-2">
          <div class="relative">
            <Search
              class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Rechercher un talent..."
              value={searchQuery}
              oninput={handleSearchInput}
              class="h-9 w-56 rounded-sm pl-8"
            />
          </div>

          {#if hasFilters}
            <Button
              variant="ghost"
              size="sm"
              class="gap-1.5 text-muted-foreground"
              onclick={clearFilters}
            >
              <X class="h-3.5 w-3.5" />
              Reinitialiser
            </Button>
          {/if}
        </div>
      </div>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head class={th}>Avis</Table.Head>
            <Table.Head class={th}>Talent</Table.Head>
            <Table.Head class={th}>Interviewer</Table.Head>
            <Table.Head class={th}>Campus</Table.Head>
            <Table.Head class={th}>Evenement</Table.Head>
            <Table.Head class={th}>Date</Table.Head>
            <Table.Head class={cn(th, 'text-right')}>PDF</Table.Head>
            <Table.Head class={cn(th, 'text-right')}>
              <span class="sr-only">Réinitialiser</span>
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.interviews as interview (interview.id)}
            <Table.Row>
              <Table.Cell>
                {#if interview.recommendation}
                  <Badge
                    variant={recoVariant(interview.recommendation)}
                    class="gap-1 rounded-sm font-mono text-[0.7rem] tracking-wide uppercase"
                  >
                    {recoLabels[interview.recommendation] ??
                      interview.recommendation}
                  </Badge>
                {:else}
                  <span class="text-xs text-muted-foreground">-</span>
                {/if}
              </Table.Cell>
              <Table.Cell class="font-medium">
                {interview.talentName}
              </Table.Cell>
              <Table.Cell>{interview.staffName}</Table.Cell>
              <Table.Cell>{interview.campusName}</Table.Cell>
              <Table.Cell class="max-w-48 truncate">
                {interview.eventTitle ?? '-'}
              </Table.Cell>
              <Table.Cell>
                <span class="font-mono text-xs text-muted-foreground">
                  {formatDateTimeFr(interview.conductedAt)}
                </span>
              </Table.Cell>
              <Table.Cell class="text-right">
                <a
                  href={resolve(
                    `/staff/admin/interview-pdfs/${interview.id}/pdf`,
                  )}
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1.5 text-xs text-epi-blue hover:underline"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                  Voir
                </a>
              </Table.Cell>
              <Table.Cell class="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-auto gap-1.5 p-0 text-xs text-muted-foreground hover:text-destructive"
                  onclick={() =>
                    openReset({
                      id: interview.id,
                      talentName: interview.talentName,
                      staffName: interview.staffName,
                      conductedAt: interview.conductedAt,
                    })}
                >
                  <RotateCcw class="h-3.5 w-3.5" />
                  Réinitialiser
                </Button>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={8} class="py-12 text-center">
                {#if hasFilters}
                  <p class="font-mono text-xs text-muted-foreground">
                    &lt;Aucun entretien pour ce filtre/&gt;
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    class="mt-1 text-epi-blue"
                    onclick={clearFilters}
                  >
                    Reinitialiser les filtres
                  </Button>
                {:else}
                  <p class="font-mono text-xs text-muted-foreground">
                    &lt;Aucun entretien finalise/&gt;
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

<ResetInterviewDialog bind:open={resetOpen} target={resetTarget} />
