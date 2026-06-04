<script lang="ts">
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import NewTalentBadge from '$lib/components/students/NewTalentBadge.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { buttonVariants } from '$lib/components/ui/button';
  import { capitalize, cn } from '$lib/utils';
  import { salesforceContactUrl } from '$lib/domain/salesforce';
  import { niveauLabel } from '$lib/domain/niveau';

  // Blueprint-blue band: square avatar + name with the neon-teal `_` cursor +
  // Salesforce shortcut. Firstname leads (light), surname follows in Anton
  // uppercase. No action row, no cohort rank — staff already have those
  // affordances elsewhere on the page.
  type Props = {
    student: {
      id: string;
      externalId: string | null;
      nom: string;
      prenom: string;
      niveau: string | null;
      school: { name: string } | null;
    };
    isNewTalent: boolean;
  };

  let { student, isNewTalent }: Props = $props();

  // Bare identifier so the `{#if externalId}` guard narrows inside the Tooltip
  // child snippet — member-access narrowing (student.externalId) is dropped
  // across the snippet closure.
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
      class="h-24 w-24 rounded-sm shadow-md md:h-28 md:w-28"
    />
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1
          class="flex items-baseline font-heading text-5xl tracking-wide uppercase md:text-6xl"
        >
          <span class="font-light normal-case"
            >{capitalize(student.prenom)}</span
          >
          <span class="ml-3">{student.nom}</span><span class="text-epi-teal"
            >_</span
          >
        </h1>
        {#if externalId}
          <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={salesforceContactUrl(externalId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Ouvrir dans Salesforce"
                    class={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      // Sits on the saturated PageHero band: pin an opaque card
                      // surface + explicit foreground in BOTH themes. The outline
                      // variant inherits the hero's white text (invisible in light)
                      // and uses a translucent dark bg (lets the periwinkle band
                      // bleed through and wash out the glyph in dark). Hover stays
                      // on-surface and just lifts the shadow so contrast holds.
                      'gap-2 rounded-sm bg-card text-card-foreground shadow-sm',
                      'hover:bg-card hover:text-card-foreground hover:shadow-md',
                      'dark:bg-card dark:hover:bg-card',
                    )}
                  >
                    <SalesforceIcon class="h-3.5 w-3.5" />
                    Fiche Salesforce
                  </a>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content>
                <p class="text-xs">Ouvrir la fiche Salesforce dans un onglet</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        {/if}
      </div>
      {#if subtitle}
        <p class="mt-3 font-mono text-xs text-blue-100">{subtitle}</p>
      {/if}
      {#if isNewTalent}
        <div class="mt-3"><NewTalentBadge /></div>
      {/if}
    </div>
  </div>
</PageHero>
