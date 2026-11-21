<script lang="ts">
  import * as Dialog from '#lib/components/ui/dialog/index.ts';
  import StudentContactDetails from '#lib/components/students/StudentContactDetails.svelte';
  import ResultsNotice from '#lib/components/staff/ResultsNotice.svelte';
  import { cohortNounForms } from '#lib/domain/event.ts';
  import type { PresenceRow } from './types';
  import { emargementContact } from '../contact.remote';

  // Coordinates for one row of the roster, asked on open (`emargementContact`).
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

  // One query per row, so the dialog always shows the row it is open on: an
  // answer for a row opened before lands on a query nothing reads any more.
  const contact = $derived(
    open && row ? emargementContact({ eventId, talentId: row.talentId }) : null,
  );
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

      {#if contact?.error}
        <ResultsNotice
          compact
          title="Chargement impossible"
          description="Les coordonnées n'ont pas pu être chargées. Fermez cette fenêtre puis rouvrez-la pour réessayer."
        />
      {:else if contact?.ready}
        <StudentContactDetails
          student={contact.current.student}
          guardians={contact.current.guardians}
        />
      {:else}
        <p class="text-sm text-muted-foreground italic">Chargement…</p>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
