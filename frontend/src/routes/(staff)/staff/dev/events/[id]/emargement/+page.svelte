<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import { invalidate } from '$app/navigation';
  import QrCode from '@lucide/svelte/icons/qr-code';
  import Download from '@lucide/svelte/icons/download';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { can } from '$lib/domain/permissions';
  import { defaultActiveSlotKey } from '$lib/domain/eventPresence';
  import { cohortNounForms, eventDisplayName } from '$lib/domain/event';
  import type { PageData } from './$types';
  import type { EmargementCohort } from './components/types';
  import QrDialog from './components/QrDialog.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import EmargementRoster from './components/EmargementRoster.svelte';

  let { data }: { data: PageData } = $props();

  const canEdit = $derived(can('devMember', page.data.staffProfile?.staffRole));
  // Event's Jump-owned cohort noun ("stagiaire" / "participant").
  const noun = $derived(cohortNounForms(data.event.cohortNoun));

  // ── Active créneau (shell-owned) ─────────────────────────────────────────
  // Kept here, not in the roster, so it survives the roster re-streaming every
  // 5s and stays in sync with the header QR button. The roster's SlotNavigator
  // binds it back up.
  //
  // SSR seeds with a fixed hour (the server has no local clock); the client
  // refines it to the real wall-clock half-day, and re-anchors whenever the
  // EVENT changes (see the effect below). The bare seed alone was a bug: a
  // client-side switch between events reuses this component, so the once-seeded
  // key stayed pointed at the previous event's slots. Its day was then absent
  // from the navigator, leaving the bare-dash placeholder until a full reload
  // remounted the page.
  let activeSlotKey = $state<string>(
    untrack(() => defaultActiveSlotKey(data.slots, data.todayKey, 9)),
  );
  // Re-anchor on the new event (client-side switch) and, on first client paint,
  // on the real wall-clock hour. Keyed on the event id so the 5s poll (same
  // event, fresh data) never clobbers a manually picked créneau.
  let anchoredEventId = $state<string | null>(null);
  $effect(() => {
    const eventId = data.event.id;
    if (eventId === untrack(() => anchoredEventId)) return;
    anchoredEventId = eventId;
    activeSlotKey = defaultActiveSlotKey(
      data.slots,
      data.todayKey,
      new Date().getHours(),
    );
  });
  const activeSlot = $derived(
    data.slots.find((s) => s.key === activeSlotKey) ?? data.slots[0] ?? null,
  );
  // Closed = manual early-close OR cutoff passed; both resolved synchronously in
  // the load, so the QR button's disabled-state is correct from first paint.
  const closedSet = $derived(new Set(data.closedKeys));
  const pastCutoffSet = $derived(new Set(data.pastCutoffKeys));
  const isActiveClosed = $derived(
    activeSlot ? closedSet.has(`${activeSlot.day}|${activeSlot.slot}`) : false,
  );
  // Past its cutoff = closed by the clock: it can't be reopened (the day moved
  // on); a late arrival is handled by marking that one cell by hand.
  const isActivePastCutoff = $derived(
    activeSlot
      ? pastCutoffSet.has(`${activeSlot.day}|${activeSlot.slot}`)
      : false,
  );

  // Resolve the streamed roster into local state rather than a bare `{#await}`:
  // the 5s poll (and every optimistic edit) replaces `data.cohort` with a fresh
  // promise, and a template `{#await}` would flash the skeleton + remount the
  // roster each time (wiping in-flight edits and the search box). Holding the
  // last resolved value keeps the roster mounted; the skeleton shows only on the
  // first load. The `=== p` guard drops a stale resolution arriving after a newer
  // poll has already started.
  let roster = $state<EmargementCohort | null>(null);
  let rosterFailed = $state(false);
  $effect(() => {
    const p = data.cohort;
    p.then((d) => {
      if (data.cohort === p) {
        roster = d;
        rosterFailed = false;
      }
    }).catch(() => {
      if (data.cohort === p) rosterFailed = true;
    });
  });

  let qrOpen = $state(false);
  // Reported up by the roster: true while any of its edit dialogs is open. ORed
  // with the QR dialog to pause polling so a mid-edit form isn't resynced.
  let rosterDialogOpen = $state(false);
  const anyDialogOpen = $derived(qrOpen || rosterDialogOpen);

  const exportHref = $derived(`${page.url.pathname}/export`);

  // Poll so QR self-check-ins surface within seconds (the active créneau is
  // refined to the real wall-clock hour by the anchoring effect above). Polling
  // pauses while a dialog is open so a mid-edit form isn't resynced.
  onMount(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && !anyDialogOpen) {
        invalidate('staff:event-presence');
      }
    }, 5000);
    return () => clearInterval(id);
  });
</script>

<svelte:head>
  <title>Émargement — {eventDisplayName(data.event)}</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <!-- One tooltip context for the header: the export and QR actions surface
       tooltips from here; the roster carries its own provider for per-row icons. -->
  <Tooltip.Provider delayDuration={150}>
    <PageHeader title="Émargement" subtitle={eventDisplayName(data.event)}>
      {#snippet actions()}
        <!-- Header actions act on the whole stage or the display: the full-record
             export (read) and the QR (display). The active slot's open/close
             control lives in the SYNTHÈSE card instead, beside the Clôturé badge it
             toggles. Filter-scoped controls (search, statut) stay in the toolbar. -->
        <!-- Full-record export: every talent x every créneau, NOT the on-screen
             filter (unlike the Inscrits toolbar export). Kept here, away from the
             toolbar, so it is never mistaken for a filtered export. -->
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                size="sm"
                href={exportHref}
                class="rounded-sm"
              >
                <Download class="mr-1.5 h-4 w-4" />
                Tout exporter (XLSX)
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>
            Toutes les présences de l'événement (tous les créneaux)
          </Tooltip.Content>
        </Tooltip.Root>

        {#if canEdit}
          <!-- A closed créneau (manual close OR past the 11h/15h cutoff) makes the
               QR inert: a scan lands the talent on the "créneau clôturé" screen and
               records nothing. Disable rather than project a dead code; the tooltip
               says why and, when reopenable, points at the SYNTHÈSE reopen control.
               A span wraps the button so the tooltip still fires while it's
               disabled (a disabled button takes no pointer events). -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span {...props} class="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => (qrOpen = true)}
                    disabled={!activeSlot || isActiveClosed}
                    class="rounded-sm"
                  >
                    <QrCode class="mr-1.5 h-4 w-4" />
                    Afficher le QR code
                  </Button>
                </span>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content class="max-w-56">
              {#if !isActiveClosed}
                Projetez le QR code : les {noun.plural} le scannent pour pointer eux-mêmes.
              {:else if isActivePastCutoff}
                Ce créneau est terminé : les {noun.plural} ne peuvent plus pointer
                avec le QR code.
              {:else}
                Ce créneau est clôturé : les {noun.plural} ne peuvent plus pointer.
                Rouvrez-le pour réactiver le QR code.
              {/if}
            </Tooltip.Content>
          </Tooltip.Root>
        {/if}
      {/snippet}
    </PageHeader>
  </Tooltip.Provider>

  {#if roster}
    <EmargementRoster
      rows={roster.rows}
      presences={roster.presences}
      attendanceRate={roster.attendanceRate}
      slots={data.slots}
      {activeSlot}
      {isActiveClosed}
      {isActivePastCutoff}
      {canEdit}
      eventId={data.event.id}
      cohortNoun={data.event.cohortNoun}
      timezone={data.timezone}
      bind:activeSlotKey
      bind:dialogOpen={rosterDialogOpen}
    />
  {:else if rosterFailed}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste d'émargement n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {:else}
    <ResultsSkeleton />
  {/if}
</div>

<!-- QR dialog -->
{#if activeSlot}
  <QrDialog
    bind:open={qrOpen}
    basePath={page.url.pathname}
    day={activeSlot.day}
    slot={activeSlot.slot}
  />
{/if}
