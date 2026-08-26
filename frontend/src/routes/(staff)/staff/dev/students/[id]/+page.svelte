<script lang="ts">
  import type { PageData } from './$types';

  import Plus from '@lucide/svelte/icons/plus';

  import { Button } from '$lib/components/ui/button';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';

  import TalentProfileHero from './components/TalentProfileHero.svelte';
  import TalentInterestChips from './components/TalentInterestChips.svelte';
  import TalentInterestQuotes from './components/TalentInterestQuotes.svelte';
  import TalentJourney from './components/TalentJourney.svelte';
  import TalentRecommendationList from './components/TalentRecommendationList.svelte';
  import ContactCard from './components/ContactCard.svelte';
  import RightRailCard from './components/RightRailCard.svelte';
  import TalentNotesFeed from '$lib/components/dev/notes/TalentNotesFeed.svelte';

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
</script>

<svelte:head>
  <title>{data.student.prenom} {data.student.nom}</title>
</svelte:head>

<div class="space-y-6 pb-12">
  <TalentProfileHero student={data.student} xpStory={data.xpStory} />

  <div class="grid gap-6 lg:grid-cols-10">
    <!-- Left 70%: the talent's dossier. A closing used to take this column over
         behind a toggle; it is an event-scoped act and now has its own page under
         its event, so the fiche reads closings back rather than conducting them. -->
    <div class="min-w-0 space-y-6 lg:col-span-7">
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

      <!-- What this talent has done with us, and what came of it. Titled for
             the person rather than for the table: the block carries their own
             words and the team's read on them, not just a list of dates. The
             counts live in the header's meta slot so the body stays human. -->
      <EpiSection title="Son parcours" accent="tech">
        {#snippet meta()}
          <p class="text-xs text-muted-foreground">
            {data.journey.eventCount}
            {data.journey.eventCount > 1 ? 'événements' : 'événement'}
            {#if data.journey.closingCount > 0}
              · {data.journey.closingCount}
              {data.journey.closingCount > 1 ? 'closings' : 'closing'}
            {/if}
          </p>
        {/snippet}
        <TalentJourney journey={data.journey} firstName={data.student.prenom} />
      </EpiSection>

      <EpiSection title="Recommandations" accent="together">
        <TalentRecommendationList
          recommendations={data.recommendations}
          {contacts}
        />
      </EpiSection>

      <ContactCard student={data.student} />
    </div>

    <!-- Right 30%: the talent synthesis. It used to lead with a "Mode
         entretien" toggle that swapped this whole page into a form; a closing
         is conducted under its event now, so the rail is just the read. Kept
         out of any overflow-x ancestor so the viewport-sticky positioning
         holds while the left column scrolls. -->
    <div class="lg:col-span-3">
      <div class="space-y-3 lg:sticky lg:top-6">
        <!-- Staff notes first: they are the human read on the talent and the
               reason staff open the rail, so they lead over the Synthèse's
               at-a-glance dossier status below. Same EpiSection chrome so the rail
               reads as one charte-styled column. Neutral accent: free-text notes
               carry no brand vector. A feed of many notes (pedago +
               administratif), each authored and timestamped. The "Ajouter une
               note" action sits in the card header (meta), not inside the feed. -->
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
      </div>
    </div>
  </div>
</div>
