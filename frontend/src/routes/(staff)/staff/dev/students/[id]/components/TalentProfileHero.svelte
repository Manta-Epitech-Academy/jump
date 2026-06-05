<script lang="ts">
  import SalesforceLinkButton from '$lib/components/salesforce/SalesforceLinkButton.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { capitalize, cn } from '$lib/utils';
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

  const subtitle = $derived(
    [student.school?.name, niveauLabel(student.niveau)]
      .filter(Boolean)
      .join(' · '),
  );
</script>

<PageHero>
  <div class="flex items-center gap-6">
    <TalentAvatar
      talent={{ id: student.id, nom: student.nom, prenom: student.prenom }}
      size="lg"
      class="h-24 w-24 shrink-0 rounded-sm shadow-md md:h-28 md:w-28"
    />
    <div class="min-w-0 flex-1 overflow-hidden">
      <h1
        class="flex items-baseline font-heading text-5xl tracking-wide uppercase md:text-6xl"
      >
        <span class="font-light normal-case">{capitalize(student.prenom)}</span>
        <span class="ml-3">{student.nom}</span><span class="text-epi-teal"
          >_</span
        >
      </h1>
      {#if subtitle}
        <p class="mt-3 font-mono text-xs text-blue-100">{subtitle}</p>
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
          'shrink-0 self-end bg-white font-semibold text-epi-blue shadow-md',
          'hover:bg-white/90 hover:text-epi-blue hover:shadow-lg',
        )}
      />
    {/if}
  </div>
</PageHero>
