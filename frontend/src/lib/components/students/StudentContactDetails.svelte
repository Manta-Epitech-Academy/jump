<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import Users from '@lucide/svelte/icons/users';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import TalentName from '$lib/components/students/TalentName.svelte';
  import { civiliteCourtesyTitle } from '$lib/domain/profile';
  import { formatPhoneForDisplay } from '$lib/domain/phone';
  import type { ContactPerson } from '$lib/domain/contact';

  let {
    student,
    guardians,
    layout = 'stack',
  }: {
    student: ContactPerson;
    guardians: ContactPerson[];
    // 'stack' = single column (fits a dialog); 'split' = two-column grid
    // (élève | responsables) for a full-width page section.
    layout?: 'stack' | 'split';
  } = $props();
</script>

<!-- Honorific subordinated to the name: same line, civilité muted so "Madame"
     reads as a courtesy title and the name stands on its own. Name goes through
     <TalentName> (given-first) so the surname is uppercased. -->
{#snippet identityLine(person: ContactPerson)}
  {@const title = civiliteCourtesyTitle(person.civilite)}
  {#if title || person.prenom || person.nom}
    <p class="text-sm font-semibold">
      {#if title}<span class="font-normal text-muted-foreground">{title}</span
        >{' '}{/if}<TalentName talent={person} order="given-first" />
    </p>
  {/if}
{/snippet}

{#snippet emailRow(value: string, copyLabel: string)}
  <div class="flex items-center gap-1">
    <a
      href={`mailto:${value}`}
      class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
    >
      <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="truncate">{value}</span>
    </a>
    <CopyButton {value} label={copyLabel} />
  </div>
{/snippet}

{#snippet phoneRow(value: string, copyLabel: string)}
  {@const display = formatPhoneForDisplay(value) ?? value}
  <div class="flex items-center gap-1">
    <a
      href={`tel:${value.replace(/\s+/g, '')}`}
      class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
    >
      <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{display}</span>
    </a>
    <CopyButton value={display} label={copyLabel} />
  </div>
{/snippet}

{#snippet eleve()}
  <div class="space-y-2">
    <h4 class="epi-overline text-muted-foreground">Élève</h4>
    {@render identityLine(student)}
    {#if student.email}
      {@render emailRow(student.email, "Copier l'email")}
    {:else}
      <p class="flex items-center gap-2 text-sm text-muted-foreground italic">
        <Mail class="h-4 w-4 shrink-0" />
        Aucun email
      </p>
    {/if}
    {#if student.phone}
      {@render phoneRow(student.phone, 'Copier le téléphone')}
    {:else}
      <p class="flex items-center gap-2 text-sm text-muted-foreground italic">
        <Phone class="h-4 w-4 shrink-0" />
        Aucun téléphone
      </p>
    {/if}
  </div>
{/snippet}

{#snippet responsables()}
  <div
    class="space-y-3 {layout === 'split'
      ? 'sm:border-l sm:border-border sm:pl-6'
      : 'border-t pt-4'}"
  >
    <h4 class="flex items-center gap-1.5 epi-overline text-muted-foreground">
      <Users class="h-3 w-3" />
      {guardians.length > 1 ? 'Responsables légaux' : 'Responsable légal'}
    </h4>
    {#if guardians.length === 0}
      <p class="text-sm text-muted-foreground italic">
        Aucune information renseignée
      </p>
    {:else}
      {#each guardians as guardian, i (i)}
        <div class="space-y-2">
          {@render identityLine(guardian)}
          {#if guardian.email}
            {@render emailRow(guardian.email, "Copier l'email du responsable")}
          {/if}
          {#if guardian.phone}
            {@render phoneRow(
              guardian.phone,
              'Copier le téléphone du responsable',
            )}
          {/if}
          {#if !guardian.email && !guardian.phone}
            <p class="text-sm text-muted-foreground italic">
              Aucune coordonnée
            </p>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
{/snippet}

{#if layout === 'split'}
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
    {@render eleve()}
    {@render responsables()}
  </div>
{:else}
  <div class="space-y-5">
    {@render eleve()}
    {@render responsables()}
  </div>
{/if}
