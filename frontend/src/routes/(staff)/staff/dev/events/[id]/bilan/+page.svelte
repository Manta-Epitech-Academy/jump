<script lang="ts">
  import { page } from '$app/state';
  import QrCode from '@lucide/svelte/icons/qr-code';
  import Download from '@lucide/svelte/icons/download';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import ResultsLayout from '$lib/components/staff/ResultsLayout.svelte';
  import QrProjectionDialog from '$lib/components/staff/QrProjectionDialog.svelte';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import { eventDisplayName } from '$lib/domain/event';
  import type { PageData } from './$types';
  import BilanRoster from './components/BilanRoster.svelte';
  import StatsPanel from './components/StatsPanel.svelte';

  let { data }: { data: PageData } = $props();

  let qrOpen = $state(false);
</script>

<svelte:head>
  <title>{data.form.title} · {eventDisplayName(data.event)}</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <Tooltip.Provider delayDuration={150}>
    <PageHeader title={data.form.title} subtitle={eventDisplayName(data.event)}>
      {#snippet actions()}
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
      {/snippet}
    </PageHeader>
  </Tooltip.Provider>

  <!-- The page only loads with a resolvable live form (the nav hides it and the
       load 404s otherwise), so there is no "no form" branch here. -->
  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <!-- The roster is the working surface, the rail carries the glanceable
         summary (taux de réponse + the recommendation breakdown, the one chart
         that matters). The page is read-only (no poll, no optimistic write), so
         a bare {#await} is the right pattern, like inscrits/closings; no $state
         unwrap needed. The rail holds a single card, hence no card grid. -->
    <ResultsLayout>
      {#snippet main()}
        <BilanRoster
          rows={cohort.rows}
          recoOptions={cohort.recoOptions}
          eventId={data.event.id}
          cohortNoun={data.event.cohortNoun}
        />
      {/snippet}

      {#snippet rail()}
        <StatsPanel
          respondedCount={cohort.respondedCount}
          total={cohort.total}
          stats={cohort.stats}
          cohortNoun={data.event.cohortNoun}
        />
      {/snippet}
    </ResultsLayout>
  {:catch}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {/await}
</div>

<QrProjectionDialog
  bind:open={qrOpen}
  title={data.form.title}
  description="Scanne ce QR code pour donner ton avis. Ça prend 5 minutes."
  qrSrc={`${page.url.pathname}/qr.png`}
  qrAlt="QR code du formulaire de feedback"
>
  <!-- The same link in clear: some won't scan it (they'll type it, or staff copy
       it to share elsewhere). Built from ORIGIN server-side, so it matches the
       code byte for byte. -->
  {#snippet footer()}
    {#if data.form.url}
      <div class="flex max-w-[90vw] flex-col items-center gap-2">
        <p class="text-sm text-muted-foreground">
          Pas de quoi scanner ? Ouvre ce lien dans ton navigateur :
        </p>
        <div
          class="flex max-w-full items-center gap-2 rounded-sm border bg-muted/40 px-3 py-2"
        >
          <code class="min-w-0 truncate font-mono text-sm">{data.form.url}</code
          >
          <CopyButton
            value={data.form.url}
            label="Copier le lien"
            class="shrink-0"
          />
        </div>
      </div>
    {/if}
  {/snippet}
</QrProjectionDialog>
