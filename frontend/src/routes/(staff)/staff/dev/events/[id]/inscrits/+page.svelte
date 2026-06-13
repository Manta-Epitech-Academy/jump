<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import IdCard from '@lucide/svelte/icons/id-card';
  import Smile from '@lucide/svelte/icons/smile';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';
  import ResultsSkeleton from '../components/ResultsSkeleton.svelte';
  import InscritsResults from './components/InscritsResults.svelte';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import type { FlagKey } from '$lib/domain/featureFlags';

  let { data }: { data: PageData } = $props();

  // Navigation is flat in stage-only mode (we land here, click into a profile),
  // so the breadcrumb is pure noise. It only earns its keep once coding_club
  // adds depth to the workspace.
  const hasCodingClub = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]).has('coding_club'),
  );

  let generatingBadges = $state(false);
  let badgeModeOpen = $state(false);

  // Four distinct colours, reused in both illustration grids so the foldable
  // preview visibly mirrors the simple one (same colours, doubled and flipped).
  const BADGE_MODE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

  // Generate the printable badge sheet for every inscrit of this event (no
  // selection). The endpoint builds the PDF server-side from all participations;
  // `mode` picks the simple or foldable layout. Acts on the whole event, so it
  // lives in the shell and needs none of the streamed cohort data.
  async function generateBadges(mode: 'simple' | 'foldable') {
    if (generatingBadges) return;
    badgeModeOpen = false;
    generatingBadges = true;
    try {
      const endpoint = page.url.pathname.replace(
        /\/inscrits\/?$/,
        '/badges.pdf',
      );
      const res = await fetch(`${endpoint}?mode=${mode}`);
      if (!res.ok) throw new Error(`Badges failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Badges${mode === 'foldable' ? ' pliables' : ''} - ${data.event.titre}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('generate badges', e);
      toast.error('Échec de la génération des badges.');
    } finally {
      generatingBadges = false;
    }
  }
</script>

<svelte:head>
  <title>{STAGE_SECONDE_LABEL} — Inscrits</title>
</svelte:head>

<div class="space-y-6 pb-10">
  {#if hasCodingClub}
    <PageBreadcrumb
      items={[
        {
          label: STAGE_SECONDE_LABEL,
          href: resolve(`/staff/dev/events/${data.event.id}`),
        },
        { label: 'Inscrits' },
      ]}
    />
  {/if}
  <PageHeader title="Inscrits">
    <Button
      variant="outline"
      size="sm"
      onclick={() => (badgeModeOpen = true)}
      disabled={generatingBadges}
    >
      {#if generatingBadges}
        <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
        Génération…
      {:else}
        <IdCard class="mr-1.5 h-4 w-4" />
        Générer badges
      {/if}
    </Button>
    <EventSalesforceButton externalId={data.event.externalId} />
  </PageHeader>

  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <InscritsResults
      {...cohort}
      origin={data.origin}
      countdown={data.countdown}
      timezone={data.timezone}
      event={data.event}
      {hasCodingClub}
    />
  {:catch}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <h3 class="text-sm font-bold tracking-widest text-foreground uppercase">
        Chargement impossible
      </h3>
      <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
        La liste des inscrits n'a pas pu être chargée. Rechargez la page pour
        réessayer.
      </p>
    </div>
  {/await}
</div>

<Dialog.Root bind:open={badgeModeOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Mode d'impression</Dialog.Title>
      <Dialog.Description>
        Choisissez la mise en page des badges à générer.
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid grid-cols-2 gap-4">
      <button
        type="button"
        onclick={() => generateBadges('simple')}
        class="flex cursor-pointer flex-col items-center gap-3 rounded-sm border p-4 text-center transition hover:border-epi-teal-solid hover:bg-epi-teal-solid/5"
      >
        <div class="grid grid-cols-2 gap-1 rounded-sm bg-muted/50 p-2">
          {#each BADGE_MODE_COLORS as c}
            <div
              class="flex items-center justify-center rounded bg-white py-1.5"
            >
              <Smile class="h-5 w-5" style="color: {c}" />
            </div>
          {/each}
        </div>
        <div class="space-y-1">
          <div class="font-medium">Simple</div>
          <p class="text-xs text-muted-foreground">
            Conseillé d'imprimer chaque feuille en recto-verso.
          </p>
        </div>
      </button>

      <button
        type="button"
        onclick={() => generateBadges('foldable')}
        class="flex cursor-pointer flex-col items-center gap-3 rounded-sm border p-4 text-center transition hover:border-epi-teal-solid hover:bg-epi-teal-solid/5"
      >
        <div class="grid grid-cols-2 gap-1 rounded-sm bg-muted/50 p-2">
          {#each BADGE_MODE_COLORS as c}
            <div class="flex flex-col overflow-hidden rounded bg-white">
              <div class="flex items-center justify-center py-1">
                <Smile class="h-4 w-4" style="color: {c}" />
              </div>
              <div
                class="flex items-center justify-center border-t border-dashed border-muted-foreground/40 py-1"
              >
                <Smile class="h-4 w-4 rotate-180" style="color: {c}" />
              </div>
            </div>
          {/each}
        </div>
        <div class="space-y-1">
          <div class="font-medium">Recto-verso pliable</div>
          <p class="text-xs text-muted-foreground">
            Chaque badge dupliqué à l'envers, à plier en deux.
          </p>
        </div>
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
