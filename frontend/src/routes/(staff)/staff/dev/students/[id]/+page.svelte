<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';

  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Play from '@lucide/svelte/icons/play';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Check from '@lucide/svelte/icons/check';

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
  import InterviewGrid, {
    type InterviewActionState,
  } from '$lib/components/dev/interviews/InterviewGrid.svelte';
  import InterviewProgressCard from '$lib/components/dev/interviews/InterviewProgressCard.svelte';
  import GuideCard from '$lib/components/dev/interviews/GuideCard.svelte';
  import type { InterviewStatus } from '@prisma/client';

  import type { FlagKey } from '$lib/domain/featureFlags';
  import type { InterviewProgressSummary } from '$lib/domain/interview';
  import { formatPersonName } from '$lib/domain/profile';
  import { cn } from '$lib/utils';

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

  // "Mode entretien" swaps the dossier (interests + recommendations + contact)
  // for the interview grid; the right rail swaps its synthesis for the grille
  // progress + guide. The toggle is purely a view: the interview's lifecycle is
  // independent — it stays in_progress until explicitly clôturé, so flipping the
  // switch off (or navigating away) never cancels anything. A `?interview=1`
  // deep-link (from the Entretiens list) opens it straight away.
  // svelte-ignore state_referenced_locally
  let interviewMode = $state(
    page.url.searchParams.get('interview') === '1' && data.canConductInterview,
  );
  // Interview lifecycle + ★-progress surfaced from InterviewGrid so the right
  // rail can render the grille status + progress bar next to the guide while the
  // questions live on the left.
  // svelte-ignore state_referenced_locally
  let interviewStatus = $state<InterviewStatus | null>(data.interviewStatus);
  // Minuteur anchor: the interview's conduct timestamp. Seeded from the server
  // (so a reload of a running interview resumes the clock), but the load is NOT
  // refetched on "Démarrer" (the grid uses invalidateAll: false), so when the
  // interview starts this session we stamp the client clock once — otherwise the
  // timer would only appear after a manual reload. Cleared on abandon so a later
  // start re-stamps from zero.
  // svelte-ignore state_referenced_locally
  let interviewStartedAt = $state<Date | string | null>(
    data.interviewConductedAt,
  );
  $effect(() => {
    const status = interviewStatus;
    untrack(() => {
      if (status === 'in_progress' && interviewStartedAt == null) {
        interviewStartedAt = new Date();
      } else if (status === null) {
        interviewStartedAt = null;
      }
    });
  });
  let interviewProgress = $state<InterviewProgressSummary | undefined>(
    undefined,
  );
  // Autosave + in-flight state, plus a handle to drive the grid's lifecycle from
  // the right rail (the controls live with the status card, not under the grid).
  let interviewActionState = $state<InterviewActionState | undefined>(
    undefined,
  );
  let interviewGrid = $state<InterviewGrid>();

  // Every incontournable (★) covered: the Clôturer button shifts to an
  // affirmative tone to reward completion and signal the interview is ready to
  // finalize. It stays fully usable before then (the ★ are skippable if time
  // runs short), so this affirms, never gates.
  const allEssentialDone = $derived(
    (interviewProgress?.total ?? 0) > 0 &&
      (interviewProgress?.done ?? 0) >= (interviewProgress?.total ?? 0),
  );

  // The toggle subtitle states the lifecycle, not the action, so an interview
  // left running reads as running even from the dossier view.
  const interviewToggleHint = $derived(
    interviewStatus === 'in_progress'
      ? 'Entretien en cours'
      : interviewStatus === 'done'
        ? 'Entretien finalisé'
        : "Saisir la grille d'orientation",
  );
  const interviewConductedLabel = $derived(
    data.interviewConductedAt
      ? new Date(data.interviewConductedAt).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          timeZone: data.timezone,
        })
      : null,
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
    <!-- Left 70% — the talent's dossier in normal mode; the interview grid takes
         over in interview mode. The grid stays mounted (just hidden) so toggling
         the view never tears down its form: an interview is a lifecycle, not a
         screen. Dossier first, grid last, so the trailing hidden node doesn't
         offset the rhythm of the space-y stack. -->
    <div class="space-y-6 lg:col-span-7">
      {#if !interviewMode}
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

        <EpiSection title="Recommandations" accent="together">
          <TalentRecommendationList
            recommendations={data.recommendations}
            {contacts}
          />
        </EpiSection>

        <ContactCard student={data.student} />
      {/if}

      {#if data.canConductInterview}
        <div class:hidden={!interviewMode}>
          <InterviewGrid
            bind:this={interviewGrid}
            form={data.interviewForm}
            talentName={formatPersonName(data.student.prenom, data.student.nom)}
            bind:status={interviewStatus}
            bind:progress={interviewProgress}
            bind:actionState={interviewActionState}
          />
        </div>
      {/if}
    </div>

    <!-- Right 30% — the interview-mode toggle, then either the grille progress +
         guide (interview mode) or the talent synthesis. Kept out of any
         overflow-x ancestor so the viewport-sticky positioning holds while the
         left column scrolls. -->
    <div class="lg:col-span-3">
      <div class="space-y-3 lg:sticky lg:top-6">
        {#if data.canConductInterview}
          <!-- The whole card is the toggle: a big click target (no fiddly
               switch) with an epi-blue tint so it reads as the primary action of
               the rail. <button> can't wrap <p>, so the copy uses block spans. -->
          <button
            type="button"
            aria-pressed={interviewMode}
            aria-label="Activer le mode entretien"
            onclick={() => (interviewMode = !interviewMode)}
            class={cn(
              'block w-full cursor-pointer rounded-sm border px-4 py-3 text-left transition-colors',
              interviewMode
                ? 'border-epi-blue/50 bg-epi-blue/10 hover:bg-epi-blue/15'
                : 'border-epi-blue/30 bg-epi-blue/5 hover:bg-epi-blue/10',
            )}
          >
            <span class="flex items-center justify-between gap-3">
              <span class="min-w-0">
                <span
                  class="flex items-center gap-1.5 text-sm font-bold text-foreground"
                >
                  <MessageSquare class="h-4 w-4 text-epi-blue" />
                  Mode entretien
                </span>
                <span class="block text-xs text-muted-foreground">
                  {interviewToggleHint}
                </span>
              </span>
              <!-- Decorative switch: the card itself is the control (carries
                   aria-pressed + label), so this only mirrors the state. Mirrors
                   ui/switch sizing/colors to stay consistent with the app. -->
              <span
                aria-hidden="true"
                class={cn(
                  'inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors',
                  interviewMode ? 'bg-primary' : 'bg-input dark:bg-input/80',
                )}
              >
                <span
                  class={cn(
                    'block size-4 rounded-full bg-background ring-0 transition-transform',
                    interviewMode
                      ? 'translate-x-[calc(100%-2px)] dark:bg-primary-foreground'
                      : 'translate-x-0 dark:bg-foreground',
                  )}
                ></span>
              </span>
            </span>
            {#if interviewMode && interviewStatus === 'in_progress'}
              <span
                class="mt-2 block border-t pt-2 text-xs text-muted-foreground"
              >
                Vous pouvez naviguer ailleurs : l'entretien reste en cours tant
                que vous ne l'avez pas clôturé.
              </span>
            {/if}
          </button>
        {:else}
          <!-- No active stage participation to attach the interview to: keep the
               toggle visible but disabled, with the reason on hover. -->
          <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <div
                    {...props}
                    class="flex items-center justify-between gap-3 rounded-sm border bg-card px-4 py-3 opacity-70"
                  >
                    <div class="min-w-0">
                      <p
                        class="flex items-center gap-1.5 text-sm font-bold text-foreground"
                      >
                        <MessageSquare class="h-4 w-4 text-muted-foreground" />
                        Mode entretien
                      </p>
                      <p class="text-xs text-muted-foreground">
                        Indisponible pour ce stagiaire
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      class="inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent bg-input shadow-xs dark:bg-input/80"
                    >
                      <span
                        class="block size-4 translate-x-0 rounded-full bg-background dark:bg-foreground"
                      ></span>
                    </span>
                  </div>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content>
                <p>{data.noInterviewReason}</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        {/if}

        {#if interviewMode}
          {#snippet interviewControls()}
            {#if interviewStatus === null}
              <p class="text-xs text-muted-foreground">
                Démarrez pour saisir les réponses. Tout est enregistré au fur et
                à mesure ; vous clôturez à la fin.
              </p>
              <Button
                class="w-full justify-center"
                disabled={interviewActionState?.busy}
                onclick={() => interviewGrid?.start()}
              >
                {#if interviewActionState?.busy && interviewActionState.lastAction === 'start'}
                  <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
                {:else}
                  <Play class="mr-1.5 h-4 w-4" />
                {/if}
                Démarrer l'entretien
              </Button>
            {:else if interviewStatus === 'in_progress'}
              <p
                class="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                {#if interviewActionState?.saveState === 'saving'}
                  <Loader2 class="h-3.5 w-3.5 animate-spin" /> Enregistrement…
                {:else if interviewActionState?.saveState === 'saved'}
                  <span
                    class="inline-flex"
                    in:scale={{ duration: 220, start: 0.5, easing: backOut }}
                  >
                    <Check class="h-3.5 w-3.5 text-epi-teal-solid" />
                  </span> Enregistré
                {:else}
                  Enregistrement automatique
                {/if}
              </p>
              <Button
                class={cn(
                  'w-full justify-center',
                  allEssentialDone &&
                    'bg-epi-teal-solid text-white hover:bg-epi-teal-solid/90',
                )}
                disabled={interviewActionState?.busy}
                onclick={() => interviewGrid?.close()}
              >
                {#if interviewActionState?.busy && interviewActionState.lastAction === 'close'}
                  <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
                {:else}
                  <Lock class="mr-1.5 h-4 w-4" />
                {/if}
                Clôturer l'entretien
              </Button>
              <Button
                variant="ghost"
                class="w-full justify-center text-muted-foreground hover:text-destructive"
                disabled={interviewActionState?.busy}
                onclick={() => interviewGrid?.abandon()}
              >
                <Trash2 class="mr-1.5 h-4 w-4" />
                Abandonner
              </Button>
            {:else if interviewStatus === 'done'}
              {#if interviewConductedLabel}
                <p class="text-xs text-muted-foreground">
                  Entretien mené le {interviewConductedLabel}
                </p>
              {/if}
              <Button
                variant="outline"
                class="w-full justify-center"
                disabled={interviewActionState?.busy}
                onclick={() => interviewGrid?.reopen()}
              >
                {#if interviewActionState?.busy && interviewActionState.lastAction === 'reopen'}
                  <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
                {:else}
                  <LockOpen class="mr-1.5 h-4 w-4" />
                {/if}
                Rouvrir l'entretien
              </Button>
            {/if}
          {/snippet}
          <InterviewProgressCard
            status={interviewStatus}
            progress={interviewProgress}
            startedAt={interviewStartedAt}
            footer={interviewControls}
          />
          <GuideCard />
        {:else}
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
        {/if}
      </div>
    </div>
  </div>
</div>
