import {
  FACET_NONE,
  listFacets,
  matchesListFacets,
  type FacetDef,
  type ListFacet,
} from './listFacets';
import { BILAN_FACETS, type BilanFacet, type BilanView } from './bilanView';

/** One row of the Feedback page: an enrolment the dev space shows, with its
 *  answer if any. */
export type BilanRow = {
  talentId: string;
  nom: string | null;
  prenom: string | null;
  respondedAt: string | null;
  /**
   * The recommendation option picked, null when there is none: not answered
   * (yet), or an `extra` option, which is no verdict (`recoQuestionOf`).
   */
  recoOptionId: string | null;
};

/** A recommendation option: its id is what the address filters on, its label
 *  what the roster shows. Best to worst, the order the filter lists them in. */
export type RecoOption = { id: string; label: string };

/**
 * The Feedback table's column filters. The recommendation's vocabulary is the
 * form's own options, so the definitions are built from them; what a row
 * carries does not depend on them.
 */
function facetDefs(
  recoOptions: readonly RecoOption[],
): Record<BilanFacet, FacetDef<BilanRow>> {
  return {
    reco: {
      title: 'Recommandation',
      valuesOf: (r) => [r.recoOptionId ?? FACET_NONE],
      vocabulary: () => [
        ...recoOptions.map((o): [string, string] => [o.id, o.label]),
        [FACET_NONE, 'Sans réponse'],
      ],
    },
    reponse: {
      title: 'Réponse',
      valuesOf: (r) => [r.respondedAt ? 'responded' : 'pending'],
      vocabulary: () => [
        ['responded', 'A répondu'],
        ['pending', 'En attente'],
      ],
    },
  };
}

export type BilanFacetState = ListFacet<BilanFacet>;

/** The facets with their counted values and what the view ticks in them. */
export function bilanFacets(
  rows: readonly BilanRow[],
  recoOptions: readonly RecoOption[],
  view: BilanView,
): BilanFacetState[] {
  return listFacets(rows, facetDefs(recoOptions), BILAN_FACETS, view.facets);
}

/** Whether a row survives every active facet. */
export function matchesBilanFacets(
  row: BilanRow,
  facets: readonly BilanFacetState[],
): boolean {
  return matchesListFacets(row, facets, facetDefs([]));
}
