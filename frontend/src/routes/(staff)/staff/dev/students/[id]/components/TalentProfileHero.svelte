<script lang="ts">
  import SalesforceLinkButton from '$lib/components/salesforce/SalesforceLinkButton.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { cn } from '$lib/utils';
  import { formatGivenName } from '$lib/domain/profile';
  import { niveauLabel } from '$lib/domain/niveau';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import type { XpStory } from '$lib/domain/xpStory';
  import TalentXpDetailDialog from './TalentXpDetailDialog.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  // Blueprint-blue band: square avatar + name with the neon-teal `_` cursor.
  // Firstname leads (light), surname follows in Anton uppercase. The XP medallion
  // sits beside the name (its identity, click it for the full breakdown); the
  // Salesforce pill is a separate utility pushed to the far-right top of the band.
  type Props = {
    student: {
      id: string;
      externalId: string | null;
      nom: string;
      prenom: string;
      niveau: string | null;
      school: { name: string } | null;
    };
    xpStory: XpStory;
  };

  let { student, xpStory }: Props = $props();

  const externalId = $derived(student.externalId);
  let detailOpen = $state(false);

  // Academic context only: school · niveau. Civilité moved to the Coordonnées
  // section, where it reads as civil identity rather than a banner tagline.
  const subtitle = $derived(
    [student.school?.name, niveauLabel(student.niveau)]
      .filter(Boolean)
      .join(' · '),
  );
</script>

<PageHero>
  <!-- Desktop (`sm+`): one centered row — avatar, name, XP medallion, then the
       Salesforce utility pushed to the far right (`ml-auto`), never reading as
       paired with the XP. Mobile: the avatar and the medallion share the top row
       (the `sm:contents` wrapper groups them on mobile, then dissolves at `sm` so
       all four items flow into the single row, reordered via `order`), and the
       name + subtitle take their own full-width line below. -->
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
    <div class="flex items-center gap-4 sm:contents">
      <TalentAvatar
        talent={{ id: student.id, nom: student.nom, prenom: student.prenom }}
        size="lg"
        class="h-20 w-20 shrink-0 rounded-sm shadow-raised sm:order-1 sm:h-24 sm:w-24 md:h-28 md:w-28"
      />

      {#if xpStory.total > 0}
        <!-- Glorified XP medallion, the fiche's through-line: click for the
             breakdown. A translucent white panel rather than a filled accent:
             the neon is the charte's accent, not a block of it, and a filled
             ink token here inverted to neon under `on-dark` and put white text
             on it at 1.3:1. Beside the avatar on mobile, after the name on desktop
             (via `order`), kept apart from the Salesforce utility. A compact,
             content-hugging badge either way. -->
        <button
          type="button"
          onclick={() => (detailOpen = true)}
          aria-label="Voir le détail des XP"
          class="group flex shrink-0 cursor-pointer items-center gap-3 rounded-sm bg-white/10 px-4 py-3 text-left text-white ring-1 ring-white/20 transition-colors hover:bg-white/15 sm:order-3"
        >
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white/15"
          >
            <Sparkles class="h-5 w-5" />
          </span>
          <span class="min-w-0">
            <span class="block epi-overline"> XP sur JUMP </span>
            <span class="flex items-baseline gap-1">
              <span class="font-heading text-display-xl text-epi-tech"
                >{xpStory.total}</span
              >
              <span class="font-heading text-display-s text-epi-tech">XP</span>
            </span>
          </span>
          <ChevronRight
            class="h-4 w-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5 group-hover:text-white"
          />
        </button>
      {/if}
    </div>

    <div class="min-w-0 overflow-hidden sm:order-2">
      <h1
        class="flex flex-wrap items-baseline font-heading text-display-l sm:text-display-2xl md:text-display-2xl"
      >
        <span class="font-light normal-case"
          >{formatGivenName(student.prenom)}</span
        >
        <span class="ml-3">{student.nom}<TitleCursor /></span>
      </h1>
      {#if subtitle}
        <!-- White at 80% (4.94:1 on `epiBlue`), not `text-primary`: `--primary`
             IS `epiBlue`, and `.on-dark` re-points the ink tokens but not the
             roles derived from the brand blue itself, so this line rendered
             epiBlue on epiBlue - 1:1, invisible - on the one surface it only
             ever appears on. Not `epiTech` either: the neon in this band is the
             XP figure's, and a second use would stop it meaning progress. -->
        <p class="mt-2 font-mono text-xs text-white/80 sm:mt-3">{subtitle}</p>
      {/if}
    </div>

    {#if externalId}
      <!-- Salesforce: a utility shortcut to the CRM, pushed to the far right of
           the band, away from the XP. Solid white pill so it reads as clickable
           against the saturated blue. -->
      <SalesforceLinkButton
        {externalId}
        kind="lead"
        label="Fiche Salesforce"
        variant="default"
        class={cn(
          'w-full shrink-0 justify-center bg-card font-semibold text-epi-blue shadow-raised sm:order-4 sm:ml-auto sm:w-auto sm:self-start',
          'hover:bg-white/90 hover:text-epi-blue hover:shadow-raised',
        )}
      />
    {/if}
  </div>
</PageHero>

{#if xpStory.total > 0}
  <TalentXpDetailDialog
    bind:open={detailOpen}
    story={xpStory}
    prenom={student.prenom}
  />
{/if}
