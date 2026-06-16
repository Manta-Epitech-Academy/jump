<script lang="ts">
  import SalesforceLinkButton from '$lib/components/salesforce/SalesforceLinkButton.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { cn } from '$lib/utils';
  import { formatGivenName } from '$lib/domain/profile';
  import { niveauLabel } from '$lib/domain/niveau';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Trophy from '@lucide/svelte/icons/trophy';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import type { XpStory } from '$lib/domain/xpStory';
  import TalentXpDetailDialog from './TalentXpDetailDialog.svelte';

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
  // Mini-jeux + podiums are the engagement closest to the XP itself; coding clubs
  // and events earn XP too but live in the click-through detail, not the banner.
  const hasGameStats = $derived(
    xpStory.minigamePlays > 0 || xpStory.podiumCount > 0,
  );
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
  <!-- One compact row at `sm`: avatar, name + subtitle, then the XP medallion
       beside the name (keeps the band height driven by the avatar, not a stacked
       block). The Salesforce utility is pushed to the far right (`ml-auto`) so it
       never reads as paired with the XP. Stacks to a column below `sm`. -->
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
    <TalentAvatar
      talent={{ id: student.id, nom: student.nom, prenom: student.prenom }}
      size="lg"
      class="h-20 w-20 shrink-0 rounded-sm shadow-md sm:h-24 sm:w-24 md:h-28 md:w-28"
    />
    <div class="min-w-0 overflow-hidden">
      <h1
        class="flex flex-wrap items-baseline font-heading text-3xl tracking-wide uppercase sm:text-5xl md:text-6xl"
      >
        <span class="font-light normal-case"
          >{formatGivenName(student.prenom)}</span
        >
        <span class="ml-3"
          >{student.nom}<span class="text-epi-teal">_</span></span
        >
      </h1>
      {#if subtitle}
        <p class="mt-2 font-mono text-xs text-blue-100 sm:mt-3">{subtitle}</p>
      {/if}
    </div>

    {#if xpStory.total > 0}
      <!-- Glorified XP medallion, the fiche's through-line: click for the
           breakdown. Beside the name (its identity), separate from Salesforce. -->
      <button
        type="button"
        onclick={() => (detailOpen = true)}
        aria-label="Voir le détail des XP"
        class="group flex shrink-0 cursor-pointer items-center gap-3 rounded-sm bg-epi-teal-solid px-4 py-3 text-left text-white shadow-md ring-1 ring-white/10 transition-colors hover:bg-epi-teal-solid/90"
      >
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white/15"
        >
          <Sparkles class="h-5 w-5" />
        </span>
        <span class="min-w-0">
          <span
            class="block font-mono text-[10px] font-bold tracking-widest text-white/80 uppercase"
          >
            XP sur JUMP
          </span>
          <span class="flex items-baseline gap-1">
            <span class="font-heading text-4xl leading-none tabular-nums"
              >{xpStory.total}</span
            >
            <span class="font-heading text-lg">XP</span>
          </span>
          {#if hasGameStats}
            <span
              class="mt-1 flex items-center gap-3 font-mono text-[11px] text-white/90"
            >
              {#if xpStory.minigamePlays > 0}
                <span class="inline-flex items-center gap-1">
                  <Gamepad2 class="h-3 w-3" />{xpStory.minigamePlays}
                </span>
              {/if}
              {#if xpStory.podiumCount > 0}
                <span class="inline-flex items-center gap-1">
                  <Trophy class="h-3 w-3" />{xpStory.podiumCount}
                </span>
              {/if}
            </span>
          {/if}
        </span>
        <ChevronRight
          class="h-4 w-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5 group-hover:text-white"
        />
      </button>
    {/if}

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
          'w-full shrink-0 justify-center bg-white font-semibold text-epi-blue shadow-md sm:ml-auto sm:w-auto sm:self-start',
          'hover:bg-white/90 hover:text-epi-blue hover:shadow-lg',
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
