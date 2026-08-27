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
  import { page } from '$app/state';
  import {
    resetListParams,
    setListParams,
  } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import * as Table from '$lib/components/ui/table';
  import KpiTile, { type KpiTone } from '$lib/components/staff/KpiTile.svelte';
  import type { Icon as IconType } from '@lucide/svelte';
  import {
    CLOSING_RECOMMENDATIONS,
    CLOSING_RECOMMENDATION_DISPLAY_ORDER,
    type RecommendationToneToken,
    type RecommendationIconToken,
  } from '$lib/domain/closing';
  import type { ClosingRecommendation } from '@prisma/client';
  import { cn, formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import ExportMenu from './components/ExportMenu.svelte';
  import ResetClosingDialog from './components/ResetClosingDialog.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import CodeTag from '$lib/components/layout/CodeTag.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data }: { data: PageData } = $props();

  // Resolve the streamed cohort into local state rather than a bare `{#await}`:
  // search and the reco tiles re-navigate (and the reset action re-runs the
  // load), each handing `data.cohort` a fresh promise. A template `{#await}`
  // would flash the skeleton + remount the table + KPI tiles on every one of
  // those; holding the last result keeps them in place and shows the skeleton
  // only on the first load. The `=== p` guard drops a stale resolution arriving
  // after a newer navigation has started. Mirrors talents / sf-conflicts.
  type Cohort = Awaited<PageData['cohort']>;
  let cohort = $state<Cohort | null>(null);
  let cohortFailed = $state(false);
  $effect(() => {
    const p = data.cohort;
    p.then((d) => {
      if (data.cohort === p) {
        cohort = d;
        cohortFailed = false;
      }
    }).catch(() => {
      if (data.cohort === p) cohortFailed = true;
    });
  });

  type ResetTarget = {
    id: string;
    talentName: string;
    staffName: string;
    conductedAt: string;
  };
  let resetOpen = $state(false);
  let resetTarget = $state<ResetTarget | null>(null);

  function openReset(closing: ResetTarget) {
    resetTarget = closing;
    resetOpen = true;
  }

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

  // The KPI tiles mirror the recommendation catalogue (label, icon, accent) so
  // they can't drift from the verdict surfaces (the dev synthesis card and the
  // exported PDF). Only the two view-local vocabularies are mapped here: the
  // catalogue's brand tone token -> a KpiTile tone, and its face glyph -> a
  // Lucide component. The sub-caption is editorial copy the catalogue doesn't
  // carry, so it stays a local table.
  const recoTone: Record<RecommendationToneToken, KpiTone> = {
    'epi-tech': 'teal',
    'epi-blue': 'blue',
    'epi-drift': 'neutral',
    'epi-tomorrow': 'pink',
  };
  const recoIcon: Record<RecommendationIconToken, typeof IconType> = {
    laugh: Laugh,
    smile: Smile,
    meh: Meh,
    frown: Frown,
  };
  const recoCaption: Record<ClosingRecommendation, string> = {
    tres_compatible: '100 % compatible',
    bon_profil: 'Bon profil',
    indecis: 'À relancer',
    pas_interesse: 'Non motivé',
  };

  type KpiCard = {
    key: string;
    label: string;
    caption: string;
    tone: KpiTone;
    Icon: typeof IconType;
  };
  const cards: KpiCard[] = [
    {
      key: 'all',
      label: 'Tous',
      caption: 'Closings finalisés',
      tone: 'neutral',
      Icon: Layers,
    },
    ...CLOSING_RECOMMENDATION_DISPLAY_ORDER.map((key): KpiCard => {
      const desc = CLOSING_RECOMMENDATIONS[key];
      return {
        key,
        label: desc.short,
        caption: recoCaption[key],
        tone: recoTone[desc.tone],
        Icon: recoIcon[desc.icon],
      };
    }),
  ];

  function cardValue(key: string): number {
    if (!cohort) return 0;
    if (key === 'all') return cohort.totalDone;
    return cohort.recoCounts[key] ?? 0;
  }

  const search = createUrlSearch();

  function clearFilters() {
    search.clear();
    resetListParams();
  }

  const th = 'font-mono text-xs font-normal uppercase tracking-wider';
</script>

<svelte:head>
  <title>PDF Closings</title>
</svelte:head>

<div class="space-y-6">
  <PageHeader title="PDF Closings" accroche="Synthèses de closing">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <ExportMenu lastExportAt={data.lastExportAt} />
      </div>
    {/snippet}
  </PageHeader>

  {#if cohort}
    {@const c = cohort}
    <!-- KPI tiles as filter toggles -->
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {#each cards as card (card.key)}
        <KpiTile
          label={card.label}
          value={cardValue(card.key)}
          sub={card.caption}
          icon={card.Icon}
          tone={card.tone}
          onclick={() => setListParams({ reco: card.key })}
          pressed={data.filters.reco === card.key}
        />
      {/each}
    </div>

    <Card.Root class="shadow-none">
      <Card.Header class="gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Card.Title class="flex items-center gap-2 tracking-wide uppercase">
            <FileText class="h-4 w-4 text-epi-blue" />
            Closings
            <span class="font-mono text-xs font-normal text-muted-foreground">
              ({c.matchCount}{c.truncated ? ' - 100 affichées' : ''})
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
                value={search.value}
                oninput={(e) =>
                  (search.value = (e.currentTarget as HTMLInputElement).value)}
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
              <Table.Head class={th}>Avis</Table.Head>
              <Table.Head class={th}>Talent</Table.Head>
              <Table.Head class={th}>Mené par</Table.Head>
              <Table.Head class={th}>Campus</Table.Head>
              <Table.Head class={th}>Événement</Table.Head>
              <Table.Head class={th}>Date</Table.Head>
              <Table.Head class={cn(th, 'text-right')}>PDF</Table.Head>
              <Table.Head class={cn(th, 'text-right')}>
                <span class="sr-only">Réinitialiser</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each c.closings as closing (closing.id)}
              <Table.Row>
                <Table.Cell>
                  {#if closing.recommendation}
                    <Badge
                      variant={recoVariant(closing.recommendation)}
                      class="gap-1 rounded-sm font-mono text-[0.7rem] tracking-wide uppercase"
                    >
                      {CLOSING_RECOMMENDATIONS[closing.recommendation]?.short ??
                        closing.recommendation}
                    </Badge>
                  {:else}
                    <span class="text-xs text-muted-foreground">-</span>
                  {/if}
                </Table.Cell>
                <Table.Cell class="font-medium">
                  {closing.talentName}
                </Table.Cell>
                <Table.Cell>{closing.staffName}</Table.Cell>
                <Table.Cell>{closing.campusName}</Table.Cell>
                <Table.Cell class="max-w-48 truncate">
                  {closing.eventTitle ?? '-'}
                </Table.Cell>
                <Table.Cell>
                  <span class="font-mono text-xs text-muted-foreground">
                    {formatDateTimeFr(closing.conductedAt)}
                  </span>
                </Table.Cell>
                <Table.Cell class="text-right">
                  <a
                    href={resolve(
                      `/staff/admin/closing-pdfs/${closing.id}/pdf`,
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
                        id: closing.id,
                        talentName: closing.talentName,
                        staffName: closing.staffName,
                        conductedAt: closing.conductedAt,
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
                      <CodeTag>Aucun closing pour ce filtre</CodeTag>
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
                      <CodeTag>Aucun closing finalisé</CodeTag>
                    </p>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  {:else if cohortFailed}
    <ResultsNotice
      title="Chargement impossible"
      description="Les closings n'ont pas pu être chargés. Rechargez la page pour réessayer."
    />
  {:else}
    <ResultsSkeleton rows={8} rail={false} />
  {/if}
</div>

<ResetClosingDialog bind:open={resetOpen} target={resetTarget} />
