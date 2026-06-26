<script lang="ts">
  import { page } from '$app/state';
  import QrCode from '@lucide/svelte/icons/qr-code';
  import Download from '@lucide/svelte/icons/download';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import type { PageData } from './$types';
  import BilanRoster from './components/BilanRoster.svelte';
  import StatsPanel from './components/StatsPanel.svelte';
  import QrDialog from './components/QrDialog.svelte';

  let { data }: { data: PageData } = $props();

  let qrOpen = $state(false);
</script>

<svelte:head>
  <title>{data.form?.title ?? 'Feedback'} · {data.event.titre}</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <Tooltip.Provider delayDuration={150}>
    <PageHeader title={data.form?.title ?? 'Feedback'}>
      {#if data.form}
        <div class="flex items-center gap-2">
          <Button
            href={`${page.url.pathname}/export`}
            download
            variant="outline"
            size="sm"
            class="rounded-sm"
          >
            <Download class="mr-1.5 h-4 w-4" />
            Exporter XLSX
          </Button>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="outline"
                  size="sm"
                  onclick={() => (qrOpen = true)}
                  class="rounded-sm"
                >
                  <QrCode class="mr-1.5 h-4 w-4" />
                  Afficher le QR code
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content class="max-w-56">
              Projetez le QR code : les talents le scannent pour donner leur
              avis.
            </Tooltip.Content>
          </Tooltip.Root>
        </div>
      {/if}
    </PageHeader>
  </Tooltip.Provider>

  {#if !data.form}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <h3 class="text-sm font-bold tracking-widest text-foreground uppercase">
        Aucun formulaire de feedback
      </h3>
      <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
        Aucun formulaire publié n'est associé à cet événement. Choisissez-en un
        dans les paramètres de l'événement, ou créez-en un dans l'espace admin.
      </p>
      <Button
        href={page.url.pathname.replace(/\/bilan$/, '')}
        variant="outline"
        size="sm"
        class="mt-4 rounded-sm"
      >
        <SlidersHorizontal class="mr-1.5 h-4 w-4" />
        Paramètres de l'événement
      </Button>
    </div>
  {:else}
    {#await data.cohort}
      <ResultsSkeleton />
    {:then cohort}
      <!-- 70/30 split, matching the other validated stage_seconde dev pages
           (inscrits, émargement): the roster is the working surface, the rail
           carries the glanceable summary (taux de réponse + the recommendation
           breakdown, the one chart that matters). `min-w-0` keeps the table from
           blowing the grid past the viewport. The page is read-only (no poll, no
           optimistic write), so a bare {#await} is the right pattern, like
           inscrits/entretiens; no $state unwrap needed. -->
      <div class="grid gap-6 xl:grid-cols-10">
        <div class="min-w-0 xl:col-span-7">
          <BilanRoster rows={cohort.rows} recoOptions={cohort.recoOptions} />
        </div>
        <aside class="min-w-0 xl:col-span-3">
          <div
            class="xl:sticky xl:top-6 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1"
          >
            <StatsPanel
              respondedCount={cohort.respondedCount}
              total={cohort.total}
              stats={cohort.stats}
            />
          </div>
        </aside>
      </div>
    {:catch}
      <div
        class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
      >
        <h3 class="text-sm font-bold tracking-widest text-foreground uppercase">
          Chargement impossible
        </h3>
        <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
          La liste n'a pas pu être chargée. Rechargez la page pour réessayer.
        </p>
      </div>
    {/await}
  {/if}
</div>

{#if data.form}
  <QrDialog
    bind:open={qrOpen}
    basePath={page.url.pathname}
    title={data.form.title}
    url={data.form.url}
  />
{/if}
