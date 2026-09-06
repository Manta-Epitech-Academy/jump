<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import StudentContactDetails from './StudentContactDetails.svelte';
  import { formatPersonName } from '$lib/domain/profile';
  import type { ContactPerson } from '$lib/domain/contact';

  let {
    open = $bindable(),
    student,
    guardians = [],
  }: {
    open: boolean;
    // null while no row is selected, so the dialog renders nothing rather than
    // a half-empty shell between openings.
    student: ContactPerson | null;
    guardians?: ContactPerson[];
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    {#if student}
      <Dialog.Header>
        <Dialog.Title>
          Coordonnées de {formatPersonName(student.prenom, student.nom)}
        </Dialog.Title>
        <Dialog.Description>
          Email et téléphone du talent et de ses responsables légaux.
        </Dialog.Description>
      </Dialog.Header>
      <StudentContactDetails {student} {guardians} />
    {/if}
  </Dialog.Content>
</Dialog.Root>
