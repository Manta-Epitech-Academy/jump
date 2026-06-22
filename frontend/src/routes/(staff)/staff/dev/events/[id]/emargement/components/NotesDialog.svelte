<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { base } from '$app/paths';
  import TalentNotesFeed from '$lib/components/dev/notes/TalentNotesFeed.svelte';
  import type { SerializedNote } from '$lib/domain/talentNotes';
  import {
    slotKeyOfInstant,
    slotLabelLong,
    type EventSlot,
  } from '$lib/domain/eventPresence';
  import type { PresenceRow } from './types';

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
    /** The créneau on screen when the dialog opened. When the talent has a note
     *  taken during it (the reason the trigger lit), the feed flags and reveals
     *  that note so staff don't hunt it among more-recent, unrelated ones. */
    activeSlot: EventSlot | null;
    onCountChange?: (talentId: string, count: number) => void;
  } = $props();

  let notes = $state<SerializedNote[] | null>(null);
  let loadError = $state(false);
  let requestedFor = $state<string | null>(null);

  // Fetch fresh on each open, once per targeted talent. Closing resets the guard
  // so the next open re-pulls (another staff member may have added notes since).
  $effect(() => {
    if (!open) {
      requestedFor = null;
      return;
    }
    if (!row || requestedFor === row.talentId) return;
    const talentId = row.talentId;
    requestedFor = talentId;
    notes = null;
    loadError = false;
    fetch(`${base}/staff/dev/students/${talentId}/notes`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        notes = data.notes as SerializedNote[];
      })
      .catch((e) => {
        console.error('load talent notes', e);
        loadError = true;
      });
  });

  // The note(s) whose createdAt lands in the créneau the dialog was opened on, by
  // the same mapping that lit the roster trigger (slotKeyOfInstant). The feed
  // rings them and scrolls the first into view. Empty when opened from an unlit
  // trigger (no note this créneau) — then nothing is flagged and the full feed shows.
  const highlightIds = $derived(
    notes && activeSlot
      ? notes
          .filter(
            (n) =>
              slotKeyOfInstant(new Date(n.createdAt), timezone) ===
              activeSlot.key,
          )
          .map((n) => n.id)
      : [],
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-lg">
    {#if row}
      <Dialog.Header>
        <Dialog.Title>Notes - {row.prenom} {row.nom}</Dialog.Title>
        <Dialog.Description>
          Notes réservées au staff (retard, administratif, pédagogique…).
        </Dialog.Description>
      </Dialog.Header>
      {#if loadError}
        <p class="py-6 text-center text-sm text-muted-foreground">
          Impossible de charger les notes.
        </p>
      {:else if notes === null}
        <div
          class="flex items-center justify-center py-8 text-muted-foreground"
        >
          <LoaderCircle class="h-5 w-5 animate-spin" />
        </div>
      {:else}
        {#if activeSlot && highlightIds.length > 0}
          <p class="text-xs text-muted-foreground">
            {#if highlightIds.length === 1}
              Note laissée pendant ce créneau ({slotLabelLong(activeSlot)}),
              mise en évidence ci-dessous.
            {:else}
              {highlightIds.length} notes laissées pendant ce créneau ({slotLabelLong(
                activeSlot,
              )}), mises en évidence ci-dessous.
            {/if}
          </p>
        {/if}
        {#key row.talentId}
          <TalentNotesFeed
            talentId={row.talentId}
            {notes}
            {timezone}
            {eventId}
            {highlightIds}
            showStaffOnlyHint={false}
            onCountChange={(count) => onCountChange?.(row.talentId, count)}
          />
        {/key}
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
