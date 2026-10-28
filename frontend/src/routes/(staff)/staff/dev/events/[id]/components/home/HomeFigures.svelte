<script lang="ts" module>
  /**
   * The cards' grid: at most three columns, the mockup's 3 × 3. The cards are a
   * fixed set, not a list of unknown length, so they widen on a wide screen
   * rather than multiply: an auto-fill grid went to four columns past 1500px
   * and left the ninth card alone on its row. The steps count the 272px
   * sidebar, which shows from `md`: one column until `lg`, two until `xl`,
   * three from about 300px a card. At that width a long name or lycée wraps
   * onto a second line inside its row rather than being cut.
   */
  export const HOME_GRID_CLASS =
    'grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3';
</script>

<script lang="ts">
  import { resolve } from '$app/paths';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Users from '@lucide/svelte/icons/users';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import School from '@lucide/svelte/icons/school';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Trophy from '@lucide/svelte/icons/trophy';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import { Button } from '$lib/components/ui/button';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
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

  // The cards of the event home, in the mockup's order. Every part opens the
  // page its figure comes from, filtered on it, when the event has that page;
  // where it does not, the part is a plain row.
  //
  // A section the event does not run (no closing grid, no questionnaire) has
  // no card, as it has no page in the menu. A card whose figures are only not
  // there yet keeps its place and says what will fill it. An event nobody is
  // enrolled on yet shows one notice instead of nine waiting cards.
  let {
    figures,
    eventId,
    reachable,
  }: {
    figures: EventHomeFigures;
    eventId: string;
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
      title: 'Première inscription pour tous',
      hint: "Aucun inscrit ne s'était inscrit à un événement du campus avant celui-ci.",
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
    xp: {
      icon: Trophy,
      title: "Pas encore d'XP",
      hint: 'Les XP se gagnent sur les activités et les mini-jeux de Jump.',
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
      hint: 'Le QR code à partager est sur la page Feedback.',
    },
  } satisfies Record<string, HomeCardEmpty>;

  const feedbackEmpty = $derived.by((): HomeCardEmpty | null => {
    switch (figures.feedback.kind) {
      case 'no-form':
        return null;
      case 'no-reco':
        return EMPTY.noReco;
      case 'answers':
        return figures.feedback.answered === 0 ? EMPTY.noAnswer : null;
    }
  });
</script>

{#snippet seeMore(link: HomeLink, label: string)}
  {@const href = hrefOf(link)}
  {#if href}
    <Button {href} variant="outline" size="sm">
      {label}
      <ArrowRight />
    </Button>
  {/if}
{/snippet}

{#if figures.total === 0}
  <ResultsNotice
    icon={Users}
    title="Aucun inscrit pour l'instant"
    description="Les chiffres de l'événement s'afficheront dès que ses inscriptions seront synchronisées."
  />
{:else}
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

    <TalentRankCard
      title="Parcours à Epitech"
      talents={figures.returning}
      {eventId}
      empty={figures.returning.length === 0 ? EMPTY.parcours : null}
    >
      {#snippet footer()}
        {@render seeMore(
          HOME_LINKS.returning,
          'Voir les inscrits qui reviennent',
        )}
      {/snippet}
    </TalentRankCard>

    <BreakdownCard
      title="Inscrits par genre"
      parts={figures.genre}
      variant="pie"
      {hrefOf}
    />

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
      title="Top XP"
      talents={figures.topXp}
      {eventId}
      xp
      empty={figures.topXp.length === 0 ? EMPTY.xp : null}
    >
      {#snippet footer()}
        {@render seeMore(HOME_LINKS.byXp, 'Voir les inscrits par XP')}
      {/snippet}
    </TalentRankCard>

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
              Taux de réponse : <span class="font-semibold text-foreground"
                >{figures.feedback.rate}</span
              > des inscrits
            </p>
          {/if}
        {/snippet}
      </BreakdownCard>
    {/if}
  </div>
{/if}
