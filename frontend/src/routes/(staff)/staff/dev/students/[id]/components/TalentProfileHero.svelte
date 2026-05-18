<script lang="ts">
  import Cloud from '@lucide/svelte/icons/cloud';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import NewTalentBadge from '$lib/components/students/NewTalentBadge.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { capitalize } from '$lib/utils';
  import { salesforceContactUrl } from '$lib/domain/salesforce';

  /**
   * Talent profile hero — blueprint-blue band with a square avatar, the
   * Anton-uppercase name with the neon-teal `_` cursor, the `< INSCRIT_… />`
   * code-tag overline, and a Salesforce shortcut.
   *
   * Per design feedback we strip the action button row entirely and drop the
   * right-side cohort rank. The Salesforce link survives next to the name as
   * a small but explicit button so staff can jump to the CRM without breaking
   * the headline composition.
   */
  type Props = {
    student: {
      id: string;
      externalId: string | null;
      nom: string;
      prenom: string;
      niveau: string | null;
      niveauDifficulte: string | null;
      highSchoolName: string | null;
    };
    isNewTalent: boolean;
  };

  let { student, isNewTalent }: Props = $props();

  const slug = $derived(
    student.externalId
      ? student.externalId.toUpperCase()
      : student.id.slice(0, 6).toUpperCase(),
  );

  const subtitle = $derived(
    [student.highSchoolName, student.niveau, student.niveauDifficulte]
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
      <p
        class="font-mono text-[10px] font-bold tracking-widest text-epi-teal uppercase"
      >
        <span class="opacity-60">&lt;</span>
        INSCRIT_{slug} · TALENT_VIEW
        <span class="opacity-60">/&gt;</span>
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1
          class="flex items-baseline font-heading text-5xl tracking-wide uppercase md:text-6xl"
        >
          <span>{student.nom}</span>
          <span class="ml-3 font-light">{capitalize(student.prenom)}</span><span
            class="text-epi-teal">_</span
          >
        </h1>
        {#if student.externalId}
          <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                <a
                  href={salesforceContactUrl(student.externalId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ouvrir dans Salesforce"
                  class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-epi-teal/60 bg-white/5 px-3 font-mono text-[11px] font-bold tracking-widest text-epi-teal uppercase transition-colors hover:bg-epi-teal hover:text-epi-blue"
                >
                  <Cloud class="h-4 w-4" />
                </a>
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
