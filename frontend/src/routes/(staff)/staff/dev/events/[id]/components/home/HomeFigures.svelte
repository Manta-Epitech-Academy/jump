<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import {
    eventSurfacePath,
    type EventSurfaceKey,
  } from '$lib/domain/eventModules';
  import {
    HOME_LINKS,
    type EventHomeFigures,
    type HomeLink,
  } from '$lib/domain/eventHome';
  import BreakdownCard from './BreakdownCard.svelte';
  import RankedBarsCard from './RankedBarsCard.svelte';
  import TalentRankCard from './TalentRankCard.svelte';

  // The nine cards of the event home, in the mockup's order. Every part opens
  // the page its figure comes from, filtered on it, when the event has that
  // page; where it does not, the part is a plain row.
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

  const NO_INSCRIT = "Aucun inscrit pour l'instant.";
  const NO_CLOSING = 'Cet événement ne prévoit pas de closing.';
  const noInscrit = (otherwise: string | null) =>
    figures.total === 0 ? NO_INSCRIT : otherwise;

  const feedbackEmpty = $derived.by(() => {
    switch (figures.feedback.kind) {
      case 'no-form':
        return "Cet événement n'a pas de questionnaire de feedback.";
      case 'no-reco':
        return 'Le questionnaire ne pose pas la question de recommandation.';
      case 'answers':
        return figures.feedback.answered === 0
          ? "Aucune réponse pour l'instant."
          : null;
    }
  });
</script>

{#snippet seeMore(link: HomeLink, label: string)}
  {@const href = hrefOf(link)}
  {#if href}
    <Button {href} variant="secondary" size="sm">{label}</Button>
  {/if}
{/snippet}

<div class="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-5">
  <BreakdownCard
    title="Inscrits par niveau"
    parts={figures.niveau}
    figure={figures.total}
    unit={figures.total > 1 ? 'inscrits' : 'inscrit'}
    empty={noInscrit(null)}
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
    empty={noInscrit(
      figures.returning.length === 0
        ? 'Première inscription pour chaque inscrit.'
        : null,
    )}
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
    empty={noInscrit(null)}
    {hrefOf}
  />

  <RankedBarsCard
    title="Top lycées"
    bars={figures.lycees}
    empty={noInscrit(
      figures.lycees.length === 0 ? 'Aucun lycée renseigné.' : null,
    )}
    {hrefOf}
  />

  <RankedBarsCard
    title="Top centres d'intérêt · Tech"
    bars={figures.tech}
    empty={noInscrit(
      figures.tech.length === 0
        ? "Aucun centre d'intérêt tech renseigné."
        : null,
    )}
    {hrefOf}
  />

  <TalentRankCard
    title="Top XP"
    talents={figures.topXp}
    {eventId}
    xp
    empty={noInscrit(
      figures.topXp.length === 0
        ? "Aucun inscrit n'a encore gagné d'XP."
        : null,
    )}
  >
    {#snippet footer()}
      {@render seeMore(HOME_LINKS.byXp, 'Voir les inscrits par XP')}
    {/snippet}
  </TalentRankCard>

  <BreakdownCard
    title="Closings"
    parts={figures.closings?.progress ?? []}
    variant="pie"
    empty={figures.closings ? noInscrit(null) : NO_CLOSING}
    {hrefOf}
  />

  <BreakdownCard
    title="Résultats des closings"
    parts={figures.closings?.verdicts ?? []}
    figure={figures.closings?.finalised}
    unit={(figures.closings?.finalised ?? 0) > 1 ? 'finalisés' : 'finalisé'}
    empty={figures.closings
      ? figures.closings.finalised === 0
        ? "Aucun closing finalisé pour l'instant."
        : null
      : NO_CLOSING}
    {hrefOf}
  />

  <BreakdownCard
    title="Feedback · Recommande Epitech ?"
    parts={figures.feedback.kind === 'answers' ? figures.feedback.parts : []}
    figure={figures.feedback.kind === 'answers'
      ? figures.feedback.answered
      : undefined}
    unit={figures.feedback.kind === 'answers' && figures.feedback.answered > 1
      ? 'réponses'
      : 'réponse'}
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
</div>
