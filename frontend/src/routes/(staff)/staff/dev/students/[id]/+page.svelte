<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  import MessageSquare from '@lucide/svelte/icons/message-square';
  import X from '@lucide/svelte/icons/x';

  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';

  import TalentProfileHero from './components/TalentProfileHero.svelte';
  import TalentInterestChips from './components/TalentInterestChips.svelte';
  import TalentInterestQuotes from './components/TalentInterestQuotes.svelte';
  import TalentRecommendationList from './components/TalentRecommendationList.svelte';
  import ContactCard from './components/ContactCard.svelte';
  import RightRailCard from './components/RightRailCard.svelte';
  import InterviewGrid from '$lib/components/dev/interviews/InterviewGrid.svelte';

  import type { FlagKey } from '$lib/domain/featureFlags';
  import { formatPersonName } from '$lib/domain/profile';

  let { data }: { data: PageData } = $props();

  // Navigation is flat in stage-only mode; the breadcrumb only earns its keep
  // (and a link back to the listing) once coding_club adds depth.
  const featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );
  const hasCodingClub = $derived(featureFlags.has('coding_club'));
  const talentsHref = $derived(
    hasCodingClub ? resolve('/staff/dev/students') : undefined,
  );

  const charteSigned = $derived(
    data.primaryComplianceParticipation?.stageCompliance?.charteSigned,
  );

  // Contacts surfaced (copyable) next to the recommendations that need a
  // call/email. The fiche is read-only for dev staff — no talent edits here.
  const contacts = $derived({
    parentEmail: data.student.parentEmail,
    parentPhone: data.student.parentPhone,
    studentEmail: data.student.user?.email ?? data.student.email,
    studentPhone: data.student.phone,
  });

  // "Faire l'entretien" swaps the dossier tools (recommendations + contact) for
  // the interview grid, keeping the talent context (hero, interests, right rail).
  // A `?interview=1` deep-link (from the Entretiens list) opens it straight away.
  // svelte-ignore state_referenced_locally
  let interviewMode = $state(
    page.url.searchParams.get('interview') === '1' && data.canConductInterview,
  );
</script>

<svelte:head>
  <title>{data.student.prenom} {data.student.nom}</title>
</svelte:head>

<div class="space-y-6 pb-12">
  {#if hasCodingClub}
    <PageBreadcrumb
      items={[
        { label: 'Stagiaires', href: talentsHref },
        {
          label: formatPersonName(
            data.student.prenom,
            data.student.nom,
            'surname-first',
          ),
        },
      ]}
    />
  {/if}

  <TalentProfileHero student={data.student} />

  <div class="grid gap-6 lg:grid-cols-10">
    <!-- Left 70% — the talent is the star. -->
    <div class="space-y-6 lg:col-span-7">
      <EpiSection title="Centres d'intérêt" accent="tech">
        {@const hasChips = (data.student.interests ?? []).length > 0}
        {@const hasQuotes = Boolean(
          data.student.interestsFreeText?.trim() ||
          data.student.setupDescription?.trim(),
        )}
        {#if hasChips || hasQuotes}
          <div class="space-y-6">
            {#if hasChips}
              <TalentInterestChips interests={data.student.interests ?? []} />
            {/if}
            <TalentInterestQuotes
              firstName={data.student.prenom}
              interestsFreeText={data.student.interestsFreeText}
              setupDescription={data.student.setupDescription}
            />
          </div>
        {:else}
          <p class="text-sm text-muted-foreground italic">
            Aucun centre d'intérêt renseigné.
          </p>
        {/if}
      </EpiSection>

      {#if interviewMode}
        <InterviewGrid
          form={data.interviewForm}
          talentName={formatPersonName(data.student.prenom, data.student.nom)}
          status={data.interviewStatus}
          conductedAt={data.interviewConductedAt}
          timezone={data.timezone}
        />
      {:else}
        <EpiSection title="Recommandations" accent="together">
          <TalentRecommendationList
            recommendations={data.recommendations}
            {contacts}
          />
        </EpiSection>

        <ContactCard student={data.student} />
      {/if}
    </div>

    <!-- Right 30% — prominent interview toggle + sticky synthesis. Kept out of
         any overflow-x ancestor so the viewport-sticky positioning holds while
         the left column scrolls. -->
    <div class="lg:col-span-3">
      <div class="space-y-3 lg:sticky lg:top-6">
        {#if data.canConductInterview}
          <Button
            onclick={() => (interviewMode = !interviewMode)}
            variant={interviewMode ? 'outline' : 'default'}
            size="lg"
            class="w-full justify-center gap-2"
          >
            {#if interviewMode}
              <X class="h-4 w-4" />
              Quitter l'entretien
            {:else}
              <MessageSquare class="h-4 w-4" />
              Faire l'entretien
            {/if}
          </Button>
        {:else}
          <!-- No active stage participation to attach the interview to: keep
               the control visible but disabled, with the reason on hover. -->
          <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <span {...props} class="block">
                    <Button
                      variant="default"
                      size="lg"
                      disabled
                      class="w-full justify-center gap-2"
                    >
                      <MessageSquare class="h-4 w-4" />
                      Faire l'entretien
                    </Button>
                  </span>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content>
                <p>{data.noInterviewReason}</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        {/if}

        <RightRailCard
          lastActiveAt={data.student.lastActiveAt}
          firstLoginAt={data.firstLoginAt}
          communications={data.communications}
          rulesSignedAt={data.student.rulesSignedAt}
          parentRulesSignedAt={data.student.parentRulesSignedAt}
          {charteSigned}
          imageRightsDecision={data.student.imageRightsDecision}
          timezone={data.timezone}
        />
      </div>
    </div>
  </div>
</div>
