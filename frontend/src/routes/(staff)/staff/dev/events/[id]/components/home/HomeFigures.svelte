<script lang="ts" module>
  /**
   * A section's grid: at most three columns, the mockup's three cards a row.
   * The cards are a fixed set, not a list of unknown length, so they widen on a
   * wide screen rather than multiply. The steps count the 272px sidebar, which
   * shows from `md`: one column until `lg`, two until `xl`, three from about
   * 300px a card. A long name or lycée is cut to one line rather than wrapped
   * (PO, 29/10/2026): the list each row opens names it whole.
   */
  export const HOME_GRID_CLASS =
    'grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3';
</script>

<script lang="ts">
  import { resolve } from '$app/paths';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import School from '@lucide/svelte/icons/school';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Trophy from '@lucide/svelte/icons/trophy';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import { Button } from '$lib/components/ui/button';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import EmptyCohortNotice from '$lib/components/dev/EmptyCohortNotice.svelte';
  import {
    eventSurfacePath,
    type EventSurfaceKey,
  } from '$lib/domain/eventModules';
  import {
    HOME_LINKS,
    type EventHomeFigures,
    type HomeLink,
  } from '$lib/domain/eventHome';
  import type { HomeCardEmpty } from './HomeCard.svelte';
  import BreakdownCard from './BreakdownCard.svelte';
  import RankedBarsCard from './RankedBarsCard.svelte';
  import TalentRankCard from './TalentRankCard.svelte';

  // The cards of the event home, in the mockup's three sections (#491): who is
  // coming (Audience), what moves on the day as the dossiers fill and the XP
  // comes in (En direct), and what came of it (Bilan). All three show from the
  // first day, empty ones included: the empty card says what will fill it,
  // which is also what tells the team to do it. Every part opens the page its
  // figure comes from, filtered on it, when the event has that page; where it
  // does not, the part is a plain row.
  //
  // A section the event does not run (no closing grid, no questionnaire) has
  // no card, as it has no page in the menu. A card whose figures are only not
  // there yet keeps its place and says what will fill it. An event nobody is
  // enrolled on yet shows one notice instead of nine waiting cards.
  let {
    figures,
    eventId,
    cohortNoun,
    reachable,
  }: {
    figures: EventHomeFigures;
    eventId: string;
    cohortNoun: string | null;
    reachable: readonly EventSurfaceKey[];
  } = $props();

  function hrefOf(link: HomeLink): string | null {
    if (!reachable.includes(link.surface)) return null;
    const query = new URLSearchParams(link.params).toString();
    const path = resolve(eventSurfacePath(eventId, link.surface));
    return query ? `${path}?${query}` : path;
  }

  const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

  const EMPTY = {
    parcours: {
      icon: Sparkles,
      title: 'Première venue pour tous',
      hint: "Aucun inscrit n'était encore venu à un événement du campus.",
    },
    lycees: {
      icon: School,
      title: 'Aucun lycée renseigné',
      hint: 'Le lycée vient du dossier de chaque inscrit.',
    },
    tech: {
      icon: Cpu,
      title: "Aucun centre d'intérêt tech",
      hint: 'Les inscrits les choisissent en complétant leur dossier.',
    },
    // The card ranks the XP earned on the event's activities, the only XP
    // attributed to an event: an event without one says so, which also says
    // what the card is for (PO, 30/10/2026). « Sur ses activités », never
    // « pendant l'événement »: an activity stays open once the event is over
    // and is done from anywhere.
    noActivity: {
      icon: Trophy,
      title: 'Aucune activité associée',
      hint: 'Cette carte classe les XP gagnés sur les activités de l’événement.',
    },
    xp: {
      icon: Trophy,
      title: "Pas encore d'XP gagné",
      hint: 'Les XP gagnés sur les activités de l’événement s’afficheront ici.',
    },
    verdicts: {
      icon: ClipboardCheck,
      title: 'Aucun closing finalisé',
      hint: "Les avis de l'équipe s'affichent ici dès le premier closing finalisé.",
    },
    noReco: {
      icon: MessageSquareText,
      title: 'Pas de question de recommandation',
      hint: 'Le questionnaire de cet événement ne la pose pas.',
    },
    noAnswer: {
      icon: MessageSquareText,
      title: "Aucune réponse pour l'instant",
      hint: 'Le lien à partager aux inscrits est sur la page Feedback.',
      action: openFeedback,
    },
  } satisfies Record<string, HomeCardEmpty>;

  // Nobody answered the questionnaire, or some did and none of them gave a
  // recommendation (the question skipped, or « Autre » picked): two different
  // states, and the second still has a response rate to show.
  const feedbackEmpty = $derived.by((): HomeCardEmpty | null => {
    const feedback = figures.feedback;
    switch (feedback.kind) {
      case 'no-form':
        return null;
      case 'no-reco':
        return EMPTY.noReco;
      case 'answers':
        if (feedback.responded === 0) return EMPTY.noAnswer;
        if (feedback.answered === 0)
          return {
            icon: MessageSquareText,
            title: "Aucune recommandation pour l'instant",
            hint: `Taux de réponse au questionnaire : ${feedback.rate} des inscrits.`,
          };
        return null;
    }
  });
</script>

{#snippet openFeedback()}
  {@render seeMore({ surface: 'bilan', params: {} }, 'Ouvrir la page Feedback')}
{/snippet}

<!-- The mockup's « Voir… »: a thin mono label on a quiet ground, under the
     figures it continues, rather than a full button competing with them. -->
{#snippet seeMore(link: HomeLink, label: string)}
  {@const href = hrefOf(link)}
  {#if href}
    <Button
      {href}
      variant="ghost"
      size="sm"
      class="h-7 bg-muted px-2.5 epi-overline text-foreground"
    >
      {label}
    </Button>
  {/if}
{/snippet}

{#snippet sectionTitle(id: string, rank: string, title: string)}
  <h2 {id} class="flex items-center gap-2 epi-overline text-muted-foreground">
    <span class="text-epi-blue">{rank}</span>
    <span>{title}<TitleCursor /></span>
  </h2>
{/snippet}

{#if figures.total === 0}
  <EmptyCohortNotice {cohortNoun} />
{:else}
  {@const hasBilan =
    figures.closings !== null || figures.feedback.kind !== 'no-form'}
  <div class="flex flex-col gap-8">
    <section aria-labelledby="home-audience" class="flex flex-col gap-4">
      {@render sectionTitle('home-audience', '01', 'Audience')}
      <div class={HOME_GRID_CLASS}>
        <BreakdownCard
          title="Inscrits par niveau"
          parts={figures.niveau}
          figure={figures.total}
          unit={plural(figures.total, 'inscrit', 'inscrits')}
          {hrefOf}
        >
          {#snippet footer()}
            {@render seeMore(HOME_LINKS.allInscrits, 'Voir tous les inscrits')}
          {/snippet}
        </BreakdownCard>

        <BreakdownCard
          title="Inscrits par genre"
          parts={figures.genre}
          variant="pie"
          {hrefOf}
        />

        <TalentRankCard
          title="Inscrits par parcours"
          talents={figures.returning}
          {eventId}
          variant="parcours"
          empty={figures.returning.length === 0 ? EMPTY.parcours : null}
        >
          {#snippet footer()}
            {@render seeMore(
              HOME_LINKS.returning,
              'Voir tous les inscrits par parcours',
            )}
          {/snippet}
        </TalentRankCard>
      </div>
    </section>

    <section aria-labelledby="home-live" class="flex flex-col gap-4">
      {@render sectionTitle('home-live', '02', 'En direct')}
      <div class={HOME_GRID_CLASS}>
        <RankedBarsCard
          title="Top lycées"
          bars={figures.lycees}
          empty={figures.lycees.length === 0 ? EMPTY.lycees : null}
          {hrefOf}
        />

        <RankedBarsCard
          title="Top centres d'intérêt · Tech"
          bars={figures.tech}
          empty={figures.tech.length === 0 ? EMPTY.tech : null}
          {hrefOf}
        />

        <TalentRankCard
          title="Top acquisition XP · Événement"
          talents={figures.topXp}
          {eventId}
          variant="xp"
          empty={!figures.hasActivities
            ? EMPTY.noActivity
            : figures.topXp.length === 0
              ? EMPTY.xp
              : null}
        >
          {#snippet footer()}
            {@render seeMore(HOME_LINKS.byXp, 'Voir les inscrits par XP')}
          {/snippet}
        </TalentRankCard>
      </div>
    </section>

    {#if hasBilan}
      <section aria-labelledby="home-bilan" class="flex flex-col gap-4">
        {@render sectionTitle('home-bilan', '03', 'Bilan')}
        <div class={HOME_GRID_CLASS}>
          {#if figures.closings}
            <BreakdownCard
              title="Closings"
              parts={figures.closings.progress}
              variant="pie"
              {hrefOf}
            />

            <BreakdownCard
              title="Résultats des closings"
              parts={figures.closings.verdicts}
              figure={figures.closings.finalised}
              unit={plural(figures.closings.finalised, 'finalisé', 'finalisés')}
              empty={figures.closings.finalised === 0 ? EMPTY.verdicts : null}
              {hrefOf}
            />
          {/if}

          {#if figures.feedback.kind !== 'no-form'}
            <BreakdownCard
              title="Feedback · Recommande Epitech ?"
              parts={figures.feedback.kind === 'answers'
                ? figures.feedback.parts
                : []}
              figure={figures.feedback.kind === 'answers'
                ? figures.feedback.answered
                : undefined}
              unit={figures.feedback.kind === 'answers'
                ? plural(figures.feedback.answered, 'réponse', 'réponses')
                : undefined}
              empty={feedbackEmpty}
              {hrefOf}
            >
              {#snippet below()}
                {#if figures.feedback.kind === 'answers'}
                  <p class="text-xs text-muted-foreground">
                    Taux de réponse : <span
                      class="font-semibold text-foreground"
                      >{figures.feedback.rate}</span
                    > des inscrits
                  </p>
                {/if}
              {/snippet}
            </BreakdownCard>
          {/if}
        </div>
      </section>
    {/if}
  </div>
{/if}
