<script lang="ts">
  import { resolve } from '$app/paths';
  import * as Dialog from '$lib/components/ui/dialog';
  import StudentContactDetails from '$lib/components/students/StudentContactDetails.svelte';
  import type { ContactPerson } from '$lib/domain/contact';
  import { cohortNounForms } from '$lib/domain/event';
  import type { PresenceRow } from './types';

  // Coordinates for one row of the roster, fetched on open rather than carried
  // by the cohort: the roster streams ~200 rows and none of them needs to hold a
  // phone number until somebody asks for one.
  //
  // The rendering goes through the shared `StudentContactDetails`, the same one
  // the admin directory and the student dossier use. It used to repeat that
  // component's three snippets verbatim, and had drifted: it showed a phone OR
  // an email where the shared one shows both, which is the wrong half to lose
  // when you are stood in a corridor trying to reach a family.
  let {
    open = $bindable(),
    row,
    cohortNoun,
    eventId,
  }: {
    open: boolean;
    row: PresenceRow | null;
    cohortNoun: string | null;
    eventId: string;
  } = $props();

  const noun = $derived(cohortNounForms(cohortNoun));

  type ContactDetails = {
    student: ContactPerson;
    guardians: ContactPerson[];
  };

  let loading = $state(false);
  let loadError = $state(false);
  let details = $state<ContactDetails | null>(null);

  async function loadContactDetails(talentId: string): Promise<void> {
    loading = true;
    loadError = false;
    details = null;
    try {
      const res = await fetch(
        resolve(`/staff/dev/events/${eventId}/emargement/contact/${talentId}`),
      );
      if (!res.ok) throw new Error('request_failed');
      details = (await res.json()) as ContactDetails;
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!open || !row) return;
    void loadContactDetails(row.talentId);
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    {#if row}
      <Dialog.Header>
        <Dialog.Title>Coordonnées</Dialog.Title>
        <Dialog.Description>
          Appelez le {noun.singular} en priorité, puis sa famille s'il ne répond pas.
        </Dialog.Description>
      </Dialog.Header>

      {#if loading}
        <p class="text-sm text-muted-foreground italic">Chargement…</p>
      {:else if loadError}
        <p class="text-sm text-destructive">
          Impossible de charger les coordonnées.
        </p>
      {:else if details}
        <StudentContactDetails
          student={details.student}
          guardians={details.guardians}
        />
      {:else}
        <p class="text-sm text-muted-foreground italic">Aucune coordonnée</p>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
