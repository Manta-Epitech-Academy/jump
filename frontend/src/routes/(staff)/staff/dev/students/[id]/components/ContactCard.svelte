<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import Users from '@lucide/svelte/icons/users';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import TalentName from '$lib/components/students/TalentName.svelte';
  import { civiliteCourtesyTitle } from '$lib/domain/profile';

  type Student = {
    id: string;
    prenom?: string | null;
    nom?: string | null;
    civilite?: string | null;
    email?: string | null;
    user?: { email?: string | null } | null;
    phone?: string | null;
    parentCivilite?: string | null;
    parentNom?: string | null;
    parentPrenom?: string | null;
    parentEmail?: string | null;
    parentPhone?: string | null;
  };

  let { student }: { student: Student } = $props();

  const studentEmail = $derived(student.user?.email || student.email);

  // Courtesy title (civilité) kept separate from the name so the `identityLine`
  // snippet can subordinate the honorific. Civilité lives here now that it has
  // left the hero band.
  const studentTitle = $derived(civiliteCourtesyTitle(student.civilite));
  const parentTitle = $derived(civiliteCourtesyTitle(student.parentCivilite));

  const hasParentContact = $derived(
    Boolean(
      student.parentEmail ||
      student.parentPhone ||
      student.parentNom ||
      student.parentPrenom,
    ),
  );
</script>

<!-- Honorific subordinated to the name: same line, but the civilité is muted so
     "Madame" reads as a courtesy title and the name stands on its own. The name
     goes through <TalentName> (given-first), so the surname is uppercased here
     exactly as it is in the profile hero. -->
{#snippet identityLine(
  title: string,
  person: { prenom?: string | null; nom?: string | null },
)}
  {#if title || person.prenom || person.nom}
    <p class="text-sm font-semibold">
      {#if title}<span class="font-normal text-muted-foreground">{title}</span
        >{' '}{/if}<TalentName talent={person} order="given-first" />
    </p>
  {/if}
{/snippet}

<EpiSection title="Coordonnées" accent="blue">
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
    <div class="space-y-2">
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Élève
      </h4>
      {@render identityLine(studentTitle, {
        prenom: student.prenom,
        nom: student.nom,
      })}
      {#if studentEmail}
        <div class="flex items-center gap-1">
          <a
            href={`mailto:${studentEmail}`}
            class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
          >
            <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="truncate">{studentEmail}</span>
          </a>
          <CopyButton value={studentEmail} label="Copier l'email" />
        </div>
      {:else}
        <p class="flex items-center gap-2 text-sm text-muted-foreground italic">
          <Mail class="h-4 w-4 shrink-0" />
          Aucun email
        </p>
      {/if}
      {#if student.phone}
        <div class="flex items-center gap-1">
          <a
            href={`tel:${student.phone.replace(/\s+/g, '')}`}
            class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
          >
            <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{student.phone}</span>
          </a>
          <CopyButton value={student.phone} label="Copier le téléphone" />
        </div>
      {:else}
        <p class="flex items-center gap-2 text-sm text-muted-foreground italic">
          <Phone class="h-4 w-4 shrink-0" />
          Aucun téléphone
        </p>
      {/if}
    </div>

    <div class="space-y-2 sm:border-l sm:border-border sm:pl-6">
      <h4
        class="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        <Users class="h-3 w-3" />
        Responsable légal
      </h4>
      {#if !hasParentContact}
        <p class="text-sm text-muted-foreground italic">
          Aucune information renseignée
        </p>
      {:else}
        {@render identityLine(parentTitle, {
          prenom: student.parentPrenom,
          nom: student.parentNom,
        })}
        {#if student.parentEmail}
          <div class="flex items-center gap-1">
            <a
              href={`mailto:${student.parentEmail}`}
              class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
            >
              <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="truncate">{student.parentEmail}</span>
            </a>
            <CopyButton
              value={student.parentEmail}
              label="Copier l'email parent"
            />
          </div>
        {/if}
        {#if student.parentPhone}
          <div class="flex items-center gap-1">
            <a
              href={`tel:${student.parentPhone.replace(/\s+/g, '')}`}
              class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
            >
              <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{student.parentPhone}</span>
            </a>
            <CopyButton
              value={student.parentPhone}
              label="Copier le téléphone parent"
            />
          </div>
        {/if}
      {/if}
    </div>
  </div>
</EpiSection>
