<script lang="ts">
  import { page } from '$app/state';
  import QrCode from '@lucide/svelte/icons/qr-code';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import type { PageData } from './$types';
  import type { BilanCohort } from './+page.server';
  import BilanRoster from './components/BilanRoster.svelte';
  import StatsPanel from './components/StatsPanel.svelte';
  import QrDialog from './components/QrDialog.svelte';

  let { data }: { data: PageData } = $props();

  // Resolve the streamed cohort into local state (not a bare {#await}) so the
  // roster stays mounted across navigations and keeps its search/filter state.
  let cohort = $state<BilanCohort | null>(null);
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

  let qrOpen = $state(false);
</script>

<svelte:head>
  <title>Bilan du stage · {data.event.titre}</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <Tooltip.Provider delayDuration={150}>
    <PageHeader title="Bilan du stage">
      {#if data.form}
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
            Projetez le QR code : les stagiaires le scannent pour donner leur
            avis sur le stage.
          </Tooltip.Content>
        </Tooltip.Root>
      {/if}
    </PageHeader>
  </Tooltip.Provider>

  {#if !data.form}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <h3 class="text-sm font-bold tracking-widest text-foreground uppercase">
        Aucun formulaire de bilan
      </h3>
      <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
        Le formulaire « stage » n'existe pas encore. Créez-le depuis l'espace
        admin.
      </p>
    </div>
  {:else if cohort}
    <div class="grid gap-6 xl:grid-cols-10">
      <div class="min-w-0 xl:col-span-7">
        <BilanRoster rows={cohort.rows} />
      </div>
      <div class="min-w-0 xl:col-span-3">
        <StatsPanel
          respondedCount={cohort.respondedCount}
          total={cohort.total}
          stats={cohort.stats}
        />
      </div>
    </div>
  {:else if cohortFailed}
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
  {:else}
    <ResultsSkeleton rail rows={10} />
  {/if}
</div>

{#if data.form}
  <QrDialog
    bind:open={qrOpen}
    basePath={page.url.pathname}
    title={data.form.title}
  />
{/if}
