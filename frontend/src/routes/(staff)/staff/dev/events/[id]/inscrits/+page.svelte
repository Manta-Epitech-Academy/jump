<script lang="ts">
  import { page } from '$app/state';
  import { eventDisplayName } from '$lib/domain/event';
  import { toast } from 'svelte-sonner';
  import IdCard from '@lucide/svelte/icons/id-card';
  import Award from '@lucide/svelte/icons/award';
  import Smile from '@lucide/svelte/icons/smile';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import InscritsResults from './components/InscritsResults.svelte';
  import LoadingCeremony from '$lib/components/LoadingCeremony.svelte';

  let { data }: { data: PageData } = $props();

  let generatingBadges = $state(false);
  let badgeModeOpen = $state(false);
  let generatingDiplomas = $state(false);
  // Headcount for the ceremony copy, filled from the streamed cohort when the
  // generation starts; 0 until then (the title degrades gracefully).
  let diplomaCount = $state(0);

  // "Certificat", not "diplôme": that is what the document says on its face, and
  // it stays true whichever one the event issues.
  const diplomaCeremonyTitle = $derived(
    diplomaCount > 0
      ? `Génération de ${diplomaCount} certificat${diplomaCount > 1 ? 's' : ''}`
      : 'Génération des certificats',
  );

  // Rotating step lines for the ceremony epi-overline - kept true to what the PDF
  // render actually does (one page per inscrit, with the campus signatures).
  const DIPLOMA_CEREMONY_MESSAGES = [
    'Préparation des certificats…',
    'Mise en page de chaque certificat…',
    'Application des signatures…',
    'Presque prêt…',
  ];

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

    const toastId = toast.loading('Génération des badges…');
    try {
      const endpoint = page.url.pathname.replace(
        /\/inscrits\/?$/,
        '/badges.pdf',
      );
      // Same cache-busting as the diplomas export below: `&t=` defeats
      // Cloudflare's cache-by-extension on `.pdf`, `no-store` the browser cache.
      const res = await fetch(`${endpoint}?mode=${mode}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Badges failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Badges${mode === 'foldable' ? ' pliables' : ''} - ${eventDisplayName(data.event)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Badges générés.', { id: toastId });
    } catch (e) {
      console.error('generate badges', e);
      toast.error('Échec de la génération des badges.', { id: toastId });
    } finally {
      generatingBadges = false;
    }
  }

  // Generate the internship certificate sheet for every inscrit of this event
  // (one page per student). Same whole-event flow as the badges above: the
  // endpoint builds the PDF server-side from all participations and the campus's
  // signatories.
  //
  // The render runs ~15s for a big cohort and used to leave staff staring at a
  // bare spinner, fearing it had hung (the actual reported complaint). Instead of
  // a toast we raise a full-screen LoadingCeremony for the whole wait. It owns a
  // minimum display beat, so small campuses (~1s render) still get the full
  // moment instead of a flash, while big cohorts simply stay up the natural
  // render time.
  async function generateDiplomas() {
    if (generatingDiplomas) return;
    // Flip the flag first (reentry guard + opens the overlay immediately), then
    // fill the headcount from the streamed cohort. It is almost always already
    // resolved by now, so the count lands before first paint; if it rejects, the
    // title falls back to the count-less line.
    generatingDiplomas = true;
    try {
      const { cohort } = await data.cohort;
      diplomaCount = cohort.total;
    } catch {
      diplomaCount = 0;
    }

    try {
      const endpoint = page.url.pathname.replace(
        /\/inscrits\/?$/,
        '/diplomes.pdf',
      );
      // Unique query param + no-store: the PDF is regenerated from live DB
      // (signatory role/image can change), so it must never be served from a
      // cache. `?t=` gives every request a fresh key so Cloudflare's
      // cache-by-extension on `.pdf` can't return a stale edge copy; `no-store`
      // bypasses the browser's own HTTP cache.
      const res = await fetch(`${endpoint}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Certificates failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Named for the document actually issued, e.g. "Certificat de stage - …".
      a.download = `${data.diploma?.label ?? 'Certificats'} - ${eventDisplayName(data.event)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('generate certificates', e);
      toast.error('Échec de la génération des certificats.');
    } finally {
      generatingDiplomas = false;
    }
  }
</script>

<svelte:head>
  <title>{eventDisplayName(data.event)} · Inscrits</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader title="Inscrits" subtitle={eventDisplayName(data.event)}>
    {#snippet actions()}
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
      {#if data.diploma}
        <Button
          variant="outline"
          size="sm"
          onclick={generateDiplomas}
          disabled={generatingDiplomas}
        >
          {#if generatingDiplomas}
            <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
            Génération…
          {:else}
            <Award class="mr-1.5 h-4 w-4" />
            Générer certificats
          {/if}
        </Button>
      {/if}
      <EventSalesforceButton externalId={data.event.externalId} />
    {/snippet}
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
      showStatutColumn={data.showStatutColumn}
    />
  {:catch}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste des inscrits n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
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
        class="flex cursor-pointer flex-col items-center gap-3 rounded-sm border p-4 text-center transition hover:border-epi-tech-ink hover:bg-epi-tech-ink/5"
      >
        <div class="grid grid-cols-2 gap-1 rounded-sm bg-muted/50 p-2">
          {#each BADGE_MODE_COLORS as c}
            <div
              class="flex items-center justify-center rounded bg-card py-1.5"
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
        class="flex cursor-pointer flex-col items-center gap-3 rounded-sm border p-4 text-center transition hover:border-epi-tech-ink hover:bg-epi-tech-ink/5"
      >
        <div class="grid grid-cols-2 gap-1 rounded-sm bg-muted/50 p-2">
          {#each BADGE_MODE_COLORS as c}
            <div class="flex flex-col overflow-hidden rounded bg-card">
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

<LoadingCeremony
  open={generatingDiplomas}
  title={diplomaCeremonyTitle}
  messages={DIPLOMA_CEREMONY_MESSAGES}
/>
