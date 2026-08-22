<script lang="ts">
  import type { PageData } from './$types';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';

  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Plus from '@lucide/svelte/icons/plus';

  import { Button } from '$lib/components/ui/button';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';

  import TalentProfileHero from './components/TalentProfileHero.svelte';
  import TalentInterestChips from './components/TalentInterestChips.svelte';
  import TalentInterestQuotes from './components/TalentInterestQuotes.svelte';
  import TalentEventHistory from './components/TalentEventHistory.svelte';
  import TalentRecommendationList from './components/TalentRecommendationList.svelte';
  import ContactCard from './components/ContactCard.svelte';
  import RightRailCard from './components/RightRailCard.svelte';
  import InterviewFlow from '$lib/components/dev/interviews/InterviewFlow.svelte';
  import InterviewSectionNav from '$lib/components/dev/interviews/InterviewSectionNav.svelte';
  import TalentNotesFeed from '$lib/components/dev/notes/TalentNotesFeed.svelte';
  import type { InterviewStatus } from '@prisma/client';

  import { formatPersonName } from '$lib/domain/profile';
  import { cn } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  // The notes composer is driven from the card header ("Ajouter une note"), so
  // the feed's own inline button is hidden and its open-state is bound here.
  let notesComposing = $state(false);

  // Contacts surfaced (copyable) next to the recommendations that need a
  // call/email. The fiche is read-only for dev staff, no talent edits here.
  const contacts = $derived({
    parentEmail: data.student.parentEmail,
    parentPhone: data.student.parentPhone,
    studentEmail: data.student.user?.email ?? null,
    studentPhone: data.student.phone,
  });

  // "Mode entretien" swaps the dossier (interests + recommendations + contact)
  // for the focused interview flow; the right rail drops to just this toggle so
  // nothing competes with the question on screen. The toggle is purely a view:
  // the interview's lifecycle is independent: it stays in_progress until
  // explicitly clôturé, so flipping the switch off (or navigating away) never
  // cancels anything. Two layers keep it on the URL without a load rerun:
  // `page.state.interviewMode` is the live value (shallow routing, it's what
  // `replaceState` updates reactively; `page.url` only moves on real
  // navigations), and the mirrored `?interview=1` param survives what state
  // can't: a full reload, a shared link, the Entretiens deep-link.
  const interviewMode = $derived(
    data.canConductInterview &&
      (page.state.interviewMode ??
        page.url.searchParams.get('interview') === '1'),
  );

  function setInterviewMode(on: boolean) {
    const url = new URL(page.url);
    if (on) url.searchParams.set('interview', '1');
    else url.searchParams.delete('interview');
    // replaceState, not pushState: the param persists the view across reloads,
    // it isn't a navigation, so Back should leave the fiche, not replay toggles.
    replaceState(url, { ...page.state, interviewMode: on });
  }
  // Interview lifecycle surfaced from InterviewFlow so the toggle subtitle can
  // state the lifecycle (en cours / finalisé) even from the dossier view, and
  // toggling off and on never resurfaces "Démarrer" for a started interview.
  // svelte-ignore state_referenced_locally
  let interviewStatus = $state<InterviewStatus | null>(data.interviewStatus);
  // The flow's step cursor, lifted here so the rail's section nav can jump to a
  // section while the questions live on the left.
  let interviewStep = $state(0);

  const interviewConductedLabel = $derived(
    data.interviewConductedAt
      ? new Date(data.interviewConductedAt).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          timeZone: data.timezone,
        })
      : null,
  );

  // Lifecycle echo under the toggle title, so the dossier view says where the
  // interview stands before the switch is flipped. Vocabulary and dot colors
  // mirror the Entretiens list chips (à faire / en cours / finalisé).
  const interviewSubtitle = $derived(
    interviewStatus === 'in_progress'
      ? 'Entretien en cours'
      : interviewStatus === 'done'
        ? interviewConductedLabel
          ? `Finalisé le ${interviewConductedLabel}`
          : 'Entretien finalisé'
        : 'Entretien à faire',
  );
  const interviewDotClass = $derived(
    interviewStatus === 'in_progress'
      ? 'bg-warning'
      : interviewStatus === 'done'
        ? 'bg-epi-tech-ink'
        : 'bg-muted-foreground/40',
  );
</script>

<svelte:head>
  <title>{data.student.prenom} {data.student.nom}</title>
</svelte:head>

<div class="space-y-6 pb-12">
  <TalentProfileHero student={data.student} xpStory={data.xpStory} />

  <div class="grid gap-6 lg:grid-cols-10">
    <!-- Left 70%: the talent's dossier in normal mode; the interview flow takes
         over in interview mode. The flow stays mounted (just hidden) so toggling
         the view never tears down its form: an interview is a lifecycle, not a
         screen. Dossier first, flow last, so the trailing hidden node doesn't
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

        <!-- New Visual Momentum section: Event History Timeline -->
        <EpiSection title="Historique événements" accent="blue">
          <TalentEventHistory
            events={data.eventHistory}
            timezone={data.timezone}
          />
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
          <InterviewFlow
            form={data.interviewForm}
            talentName={formatPersonName(data.student.prenom, data.student.nom)}
            conductedLabel={interviewConductedLabel}
            conductedBy={data.interviewConductedBy}
            conductedByImage={data.interviewConductedByImage}
            bind:status={interviewStatus}
            bind:step={interviewStep}
          />
        </div>
      {/if}
    </div>

    <!-- Right 30%: the interview-mode toggle, then the talent synthesis in
         dossier mode. In interview mode the rail is just the toggle, so the flow
         on the left holds the focus. Kept out of any overflow-x ancestor so the
         viewport-sticky positioning holds while the left column scrolls. -->
    <div class="lg:col-span-3">
      <div class="space-y-3 lg:sticky lg:top-6">
        {#if data.canConductInterview}
          <!-- The whole card is the toggle: a big click target (no fiddly
               switch) with an epi-blue tint so it reads as the primary action of
               the rail. The icon tile + lifecycle subtitle give it enough mass
               to be found on the dossier without shouting over it. <button>
               can't wrap <p>, so the copy uses block spans. -->
          <button
            type="button"
            aria-pressed={interviewMode}
            aria-label="Mode entretien"
            onclick={() => setInterviewMode(!interviewMode)}
            class={cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-sm border px-4 py-3.5 text-left transition-colors',
              interviewMode
                ? 'border-epi-blue/50 bg-epi-blue/10 hover:bg-epi-blue/15'
                : 'border-epi-blue/30 bg-epi-blue/5 hover:bg-epi-blue/10',
            )}
          >
            <span
              aria-hidden="true"
              class={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors',
                interviewMode
                  ? 'bg-epi-blue text-white'
                  : 'bg-epi-blue/10 text-epi-blue',
              )}
            >
              <MessageSquare class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold text-foreground">
                Mode entretien
              </span>
              <span
                class="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  class={cn('size-1.5 rounded-full', interviewDotClass)}
                ></span>
                {interviewSubtitle}
              </span>
            </span>
            <!-- Decorative switch: the card itself is the control (carries
                 aria-pressed + label), so this only mirrors the state. Follows
                 ui/switch's anatomy/colors, scaled up so the rail's main
                 control doesn't read as fine print. -->
            <span
              aria-hidden="true"
              class={cn(
                'inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent shadow-raised transition-colors',
                interviewMode ? 'bg-primary' : 'bg-input dark:bg-input/80',
              )}
            >
              <span
                class={cn(
                  'block size-5 rounded-full bg-background ring-0 transition-transform',
                  interviewMode
                    ? 'translate-x-[calc(100%-2px)] dark:bg-primary-foreground'
                    : 'translate-x-0 dark:bg-foreground',
                )}
              ></span>
            </span>
          </button>
        {:else}
          <!-- No active stage participation to attach the interview to: keep the
               toggle visible but inert, the reason stated inline where the
               lifecycle subtitle would sit (no hover needed to learn why). -->
          <div
            class="flex items-center gap-3 rounded-sm border bg-card px-4 py-3.5 opacity-70"
          >
            <span
              aria-hidden="true"
              class="flex size-9 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground"
            >
              <MessageSquare class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold text-foreground">Mode entretien</p>
              <p class="text-xs text-muted-foreground">
                {data.noInterviewReason}
              </p>
            </div>
            <span
              aria-hidden="true"
              class="inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent bg-input shadow-raised dark:bg-input/80"
            >
              <span
                class="block size-5 translate-x-0 rounded-full bg-background dark:bg-foreground"
              ></span>
            </span>
          </div>
        {/if}

        {#if interviewMode && interviewStatus === 'in_progress'}
          <InterviewSectionNav bind:step={interviewStep} />
        {:else if !interviewMode}
          <!-- Staff notes first: they are the human read on the talent and the
               reason staff open the rail, so they lead over the Synthèse's
               at-a-glance dossier status below. Same EpiSection chrome so the rail
               reads as one charte-styled column. Neutral accent: free-text notes
               carry no brand vector. A feed of many notes (pedago +
               administratif), each authored and timestamped. The "Ajouter une
               note" action sits in the card header (meta), not inside the feed.
               Hidden in interview mode so nothing competes with the question rail. -->
          <EpiSection title="Notes" accent="neutral">
            {#snippet meta()}
              <Button
                size="sm"
                variant="outline"
                disabled={notesComposing}
                onclick={() => (notesComposing = true)}
              >
                <Plus class="mr-1.5 h-3.5 w-3.5" />
                Ajouter une note
              </Button>
            {/snippet}
            <TalentNotesFeed
              talentId={data.student.id}
              notes={data.notes}
              timezone={data.timezone}
              bind:composing={notesComposing}
              showComposeButton={false}
              listMaxHeightClass="max-h-[17rem]"
            />
          </EpiSection>

          <RightRailCard
            lastActiveAt={data.student.lastActiveAt}
            firstLoginAt={data.firstLoginAt}
            communications={data.communications}
            rulesSignedAt={data.student.rulesSignedAt}
            parentRulesSignedAt={data.student.parentRulesSignedAt}
            imageRightsDecision={data.student.imageRightsDecision}
            imageRightsForm={data.imageRightsForm}
            imageRightsRecords={data.imageRightsRecords}
            studentName={`${data.student.prenom} ${data.student.nom}`}
            timezone={data.timezone}
          />
        {/if}
      </div>
    </div>
  </div>
</div>
