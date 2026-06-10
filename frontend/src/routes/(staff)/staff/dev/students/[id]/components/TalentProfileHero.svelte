<script lang="ts">
  import SalesforceLinkButton from '$lib/components/salesforce/SalesforceLinkButton.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { cn } from '$lib/utils';
  import { formatGivenName } from '$lib/domain/profile';
  import { niveauLabel } from '$lib/domain/niveau';

  // Blueprint-blue band: square avatar + name with the neon-teal `_` cursor.
  // Firstname leads (light), surname follows in Anton uppercase. The Salesforce
  // shortcut sits as a solid, high-contrast button at the bottom-right of the
  // flex row so it reads unmistakably as a button against the saturated blue.
  type Props = {
    student: {
      id: string;
      externalId: string | null;
      nom: string;
      prenom: string;
      niveau: string | null;
      school: { name: string } | null;
    };
  };

  let { student }: Props = $props();

  const externalId = $derived(student.externalId);

  // Academic context only: school · niveau. Civilité moved to the Coordonnées
  // section, where it reads as civil identity rather than a banner tagline.
  const subtitle = $derived(
    [student.school?.name, niveauLabel(student.niveau)]
      .filter(Boolean)
      .join(' · '),
  );
</script>

<PageHero>
  <!-- Stacks on a phone: a `text-5xl` name between a 96px avatar and the Salesforce
       button has no room on the row, so the name block (overflow-hidden) collapses
       and the title clips out of view. Below `sm` the band goes column (avatar, name,
       full-width button); the original row returns at `sm`. -->
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
    <TalentAvatar
      talent={{ id: student.id, nom: student.nom, prenom: student.prenom }}
      size="lg"
      class="h-20 w-20 shrink-0 rounded-sm shadow-md sm:h-24 sm:w-24 md:h-28 md:w-28"
    />
    <div class="min-w-0 flex-1 overflow-hidden">
      <h1
        class="flex flex-wrap items-baseline font-heading text-3xl tracking-wide uppercase sm:text-5xl md:text-6xl"
      >
        <span class="font-light normal-case"
          >{formatGivenName(student.prenom)}</span
        >
        <span class="ml-3">{student.nom}</span><span class="text-epi-teal"
          >_</span
        >
      </h1>
      {#if subtitle}
        <p class="mt-2 font-mono text-xs text-blue-100 sm:mt-3">{subtitle}</p>
      {/if}
    </div>

    {#if externalId}
      <!-- Solid white pill, bottom-aligned on the blue band: a filled button
           reads as clickable where the old translucent outline washed out. It
           sits in the flex flow (not an absolute overlay), so a long name clips
           against it via the sibling's overflow-hidden instead of sliding
           underneath. -->
      <SalesforceLinkButton
        {externalId}
        kind="lead"
        label="Fiche Salesforce"
        variant="default"
        class={cn(
          'w-full shrink-0 justify-center bg-white font-semibold text-epi-blue shadow-md sm:w-auto sm:self-end',
          'hover:bg-white/90 hover:text-epi-blue hover:shadow-lg',
        )}
      />
    {/if}
  </div>
</PageHero>
