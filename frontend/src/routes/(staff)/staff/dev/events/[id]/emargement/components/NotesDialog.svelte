<script lang="ts">
  import * as Dialog from '#lib/components/ui/dialog/index.ts';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TalentNotesFeed from '#lib/components/dev/notes/TalentNotesFeed.svelte';
  import ResultsNotice from '#lib/components/staff/ResultsNotice.svelte';
  import { talentNotes } from '#lib/components/dev/notes/talentNotes.remote.ts';
  import { slotLabelLong, type EventSlot } from '#lib/domain/eventPresence.ts';
  import type { PresenceRow } from './types';
  import { refreshWhenReused } from '#lib/components/remoteQuery.svelte.ts';

  // Per-row notes modal: shows the talent's full notes feed without leaving the
  // émargement table. The roster carries only a count, so the bodies are
  // lazy-loaded here on open. New notes are anchored to this event (`eventId`).
  let {
    open = $bindable(),
    row,
    eventId,
    timezone,
    activeSlot,
    onCountChange,
  }: {
    open: boolean;
    row: PresenceRow | null;
    eventId: string;
    /** Campus IANA timezone, forwarded to the feed so note times read in the
     *  campus wall clock (matches the créneau the roster lights, see types.ts). */
    timezone: string;
    /** The créneau on screen when the dialog opened. Anchors new notes to it and
     *  lifts any note already taken during it into the feed's "Ce créneau" group,
     *  so staff don't hunt it among more-recent, unrelated ones. */
    activeSlot: EventSlot | null;
    onCountChange?: (talentId: string, count: number) => void;
  } = $props();

  // Asked on each open, one query per talent: an answer for a row opened
  // before lands on a query nothing reads any more, and a reopened row is asked
  // again, since another member of staff may have added notes since.
  const notes = $derived(open && row ? talentNotes(row.talentId) : null);
  refreshWhenReused(() => notes);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-lg">
    {#if row}
      <Dialog.Header>
        <Dialog.Title>Notes - {row.prenom} {row.nom}</Dialog.Title>
        <Dialog.Description>
          Réservées au staff (retard, administratif, pédagogique…).
        </Dialog.Description>
      </Dialog.Header>
      {#if notes?.error}
        <ResultsNotice
          compact
          title="Chargement impossible"
          description="Les notes n'ont pas pu être chargées. Fermez cette fenêtre puis rouvrez-la pour réessayer."
        />
      {:else if !notes?.ready}
        <div
          class="flex items-center justify-center py-8 text-muted-foreground"
        >
          <LoaderCircle class="h-5 w-5 animate-spin" />
        </div>
      {:else}
        {#key row.talentId}
          <TalentNotesFeed
            talentId={row.talentId}
            notes={notes.current}
            {timezone}
            {eventId}
            highlightLabel={activeSlot
              ? `Ce créneau · ${slotLabelLong(activeSlot)}`
              : undefined}
            presenceDay={activeSlot?.day ?? null}
            presenceSlot={activeSlot?.slot ?? null}
            showStaffOnlyHint={false}
            onCountChange={(count) => onCountChange?.(row.talentId, count)}
          />
        {/key}
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
