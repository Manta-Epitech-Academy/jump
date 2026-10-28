import {
  CLOSING_RECOMMENDATIONS,
  CLOSING_RECOMMENDATION_DISPLAY_ORDER,
  CLOSING_STATUS_LABELS,
  type ClosingListStatus,
  type RecommendationToneToken,
} from './closing';
import { closingsFacetParams } from './closingsView';
import type { ClosingsRoster } from './closingsRoster';
import { bilanFacetParams } from './bilanView';
import { PARCOURS_BUCKETS, parcoursLabel } from './enrolmentHistory';
import { facetTally, type InscritRow } from './inscritsRoster';
import { FACET_NONE, type FacetCount } from './listFacets';
import {
  INSCRITS_NONE,
  inscritsFacetParams,
  inscritsSortParams,
} from './inscritsView';

/**
 * The event home's figures (#443): nine cards over the rosters the event's own
 * pages list, so a figure here and the list it opens can never count two
 * different cohorts.
 *
 * - The profile of the cohort (niveau, genre, lycées, tech interests, parcours,
 *   XP) is counted with `facetTally`, the count the Inscrits filters show, and
 *   each part opens Inscrits filtered on exactly the values it counted.
 * - The closings' progress and the team's verdicts come from the Closings
 *   roster and open the Closings page filtered; a verdict counts once its
 *   closing is finalised (`closingVerdict`), on the card as on the list.
 * - The recommendation comes from the Feedback roster and opens the Feedback
 *   page filtered on the option, by id.
 *
 * Every share is computed here, once, so a card never derives one itself. A
 * talent's Jump level never appears (`AGENTS.md`): the XP card lists raw XP.
 */

/** The page a part opens, and the address params that filter it. */
export type HomeLink = {
  surface: 'inscrits' | 'closings' | 'bilan';
  params: Record<string, string>;
};

/**
 * A chart colour. The four brand accents carry the first parts, as the mockup
 * draws them; `lavender` gathers the rest under « Autres », `drift` is the
 * verdict « Indécis » as every closing screen tones it, and `muted` is what is
 * missing (« Non renseigné », « Sans avis »), left unpainted. No palette of its
 * own (`DESIGN.md`).
 */
export type ChartTone =
  'blue' | 'tomorrow' | 'tech' | 'together' | 'lavender' | 'drift' | 'muted';

/** One part of a ring, with its share of the ring's whole. */
export type HomePart = {
  key: string;
  label: string;
  count: number;
  /** « 42 % », of the ring's whole. */
  share: string;
  tone: ChartTone;
  link: HomeLink;
};

/** One bar of a ranking, its width relative to the longest one. */
export type HomeBar = {
  key: string;
  label: string;
  count: number;
  /** « 42 % », of the event's inscrits. */
  share: string;
  widthPct: number;
  link: HomeLink;
};

/** A talent on a card: the parcours and XP rankings. */
export type HomeTalent = {
  talentId: string;
  prenom: string;
  nom: string;
  /** « 3ᵉ inscription », or the XP grouped by thousands (« 1 250 »). */
  detail: string;
};

export type HomeClosings = {
  /** À faire / en cours / finalisé, over the enrolments. */
  progress: HomePart[];
  /** The team's verdicts, over the finalised closings. */
  verdicts: HomePart[];
  finalised: number;
};

export type HomeFeedback =
  /** The event has no questionnaire the Feedback page would show. */
  | { kind: 'no-form' }
  /** Its questionnaire does not ask the recommendation question. */
  | { kind: 'no-reco' }
  | {
      kind: 'answers';
      /** Talents who answered the questionnaire. */
      responded: number;
      /** « 42 % », of the event's inscrits. */
      rate: string;
      /** Talents who answered the recommendation, the ring's whole. */
      answered: number;
      parts: HomePart[];
    };

export type EventHomeFigures = {
  total: number;
  niveau: HomePart[];
  genre: HomePart[];
  lycees: HomeBar[];
  tech: HomeBar[];
  /** The inscrits furthest into their parcours, newcomers left out. */
  returning: HomeTalent[];
  topXp: HomeTalent[];
  /** Null when the event runs no closing. */
  closings: HomeClosings | null;
  feedback: HomeFeedback;
};

export type EventHomeInput = {
  rows: readonly InscritRow[];
  closings: ClosingsRoster | null;
  feedback: {
    rows: readonly { respondedAt: unknown; recoOptionId: string | null }[];
    respondedCount: number;
    total: number;
    /** The recommendation options best to worst, null when not asked. */
    recoOptions: readonly { id: string; label: string }[] | null;
  } | null;
};

/** How many parts a ring shows before folding the rest into « Autres ». */
export const RING_PARTS = 4;
/** How many bars a ranking shows. */
export const TOP_BARS = 6;
/** How many talents a ranking lists. */
export const TOP_TALENTS = 5;

const ACCENTS: readonly ChartTone[] = ['blue', 'tomorrow', 'tech', 'together'];

const NBSP = ' ';

/** « 42 % », French spacing, nothing for an empty whole. */
export function shareOf(count: number, whole: number): string {
  return `${whole > 0 ? Math.round((count / whole) * 100) : 0}${NBSP}%`;
}

const inscrits = (params: Record<string, string>): HomeLink => ({
  surface: 'inscrits',
  params,
});

/**
 * A facet as a ring: its first parts in the accents, the rest folded into one
 * « Autres » part that opens Inscrits on all of them at once (a filter keeps an
 * inscrit carrying any of its values), and « Non renseigné » last, in neutral.
 * `toneOf` pins a value to a colour where the mockup gives it one (genre).
 */
function facetRing(
  rows: readonly InscritRow[],
  facet: 'niveau' | 'genre',
  toneOf?: Partial<Record<string, ChartTone>>,
): HomePart[] {
  const tally = facetTally([...rows], facet);
  const filled = tally.filter((v) => v.value !== INSCRITS_NONE);
  const missing = tally.find((v) => v.value === INSCRITS_NONE);
  const total = rows.length;

  const part = (
    key: string,
    label: string,
    values: string[],
    count: number,
    tone: ChartTone,
  ): HomePart => ({
    key,
    label,
    count,
    share: shareOf(count, total),
    tone,
    link: inscrits(inscritsFacetParams(facet, values)),
  });

  // The fold only when it spares two parts or more: « Autres » standing for a
  // single value would hide its name for nothing.
  const shown =
    filled.length > RING_PARTS ? filled.slice(0, RING_PARTS - 1) : filled;
  const rest = filled.slice(shown.length);
  const parts = shown.map((v, i) =>
    part(v.value, v.label, [v.value], v.count, toneOf?.[v.value] ?? ACCENTS[i]),
  );
  if (rest.length > 0)
    parts.push(
      part(
        'autres',
        'Autres',
        rest.map((v) => v.value),
        rest.reduce((n, v) => n + v.count, 0),
        'lavender',
      ),
    );
  if (missing)
    parts.push(
      part(
        INSCRITS_NONE,
        missing.label,
        [INSCRITS_NONE],
        missing.count,
        'muted',
      ),
    );
  return parts;
}

/** A facet as a ranking: its most carried values, « not filled in » left out. */
function facetBars(
  rows: readonly InscritRow[],
  facet: 'lycee' | 'tech',
): HomeBar[] {
  const top = facetTally([...rows], facet)
    .filter((v) => v.value !== INSCRITS_NONE)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_BARS);
  const longest = top[0]?.count ?? 0;
  return top.map((v: FacetCount) => ({
    key: v.value,
    label: v.label,
    count: v.count,
    share: shareOf(v.count, rows.length),
    widthPct: longest > 0 ? Math.round((v.count / longest) * 100) : 0,
    link: inscrits(inscritsFacetParams(facet, [v.value])),
  }));
}

const talent = (row: InscritRow, detail: string): HomeTalent => ({
  talentId: row.talentId,
  prenom: row.prenom,
  nom: row.nom,
  detail,
});

const NUMBER = new Intl.NumberFormat('fr-FR');

/** The parcours bucket every returning inscrit falls in: all but the first. */
export const RETURNING_PARCOURS = PARCOURS_BUCKETS.filter(
  (b) => b !== 'nouveau',
);

const STATUS_TONE: Record<ClosingListStatus, ChartTone> = {
  done: 'tech',
  in_progress: 'together',
  todo: 'muted',
};

const VERDICT_TONE: Record<RecommendationToneToken, ChartTone> = {
  'epi-tech': 'tech',
  'epi-blue': 'blue',
  'epi-tomorrow': 'tomorrow',
  'epi-drift': 'drift',
};

function closingsFigures(roster: ClosingsRoster): HomeClosings {
  const progress = (['done', 'in_progress', 'todo'] as const)
    .filter((status) => roster.counts[status] > 0)
    .map((status): HomePart => ({
      key: status,
      label: CLOSING_STATUS_LABELS[status],
      count: roster.counts[status],
      share: shareOf(roster.counts[status], roster.total),
      tone: STATUS_TONE[status],
      link: {
        surface: 'closings',
        params: closingsFacetParams('statut', [status]),
      },
    }));

  const finalised = roster.counts.done;
  const verdicts: HomePart[] = CLOSING_RECOMMENDATION_DISPLAY_ORDER.filter(
    (r) => roster.recoCounts[r] > 0,
  ).map((r) => ({
    key: r,
    label: CLOSING_RECOMMENDATIONS[r].label,
    count: roster.recoCounts[r],
    share: shareOf(roster.recoCounts[r], finalised),
    tone: VERDICT_TONE[CLOSING_RECOMMENDATIONS[r].tone],
    link: {
      surface: 'closings',
      params: closingsFacetParams('avis', [r]),
    },
  }));
  // A closing finalised without a verdict still belongs to the whole the ring
  // is drawn over, so it gets its part rather than shrinking the others.
  const withVerdict = verdicts.reduce((n, p) => n + p.count, 0);
  if (finalised > withVerdict)
    verdicts.push({
      key: FACET_NONE,
      label: 'Sans avis',
      count: finalised - withVerdict,
      share: shareOf(finalised - withVerdict, finalised),
      tone: 'muted',
      // Without a verdict is also every closing not finalised yet, so the list
      // is narrowed to the finalised ones the part counted.
      link: {
        surface: 'closings',
        params: {
          ...closingsFacetParams('statut', ['done']),
          ...closingsFacetParams('avis', [FACET_NONE]),
        },
      },
    });

  return { progress, verdicts, finalised };
}

function feedbackFigures(feedback: EventHomeInput['feedback']): HomeFeedback {
  if (!feedback) return { kind: 'no-form' };
  if (!feedback.recoOptions) return { kind: 'no-reco' };

  const counts = new Map<string, number>();
  for (const row of feedback.rows)
    if (row.recoOptionId)
      counts.set(row.recoOptionId, (counts.get(row.recoOptionId) ?? 0) + 1);
  const answered = [...counts.values()].reduce((n, c) => n + c, 0);

  const parts = feedback.recoOptions
    .map((option, rank) => ({
      option,
      rank,
      count: counts.get(option.id) ?? 0,
    }))
    .filter((o) => o.count > 0)
    .map(({ option, rank, count }): HomePart => ({
      key: option.id,
      label: option.label,
      count,
      share: shareOf(count, answered),
      // Colour by rank among the options, best first, so a colour keeps its
      // meaning whichever options were picked.
      tone: ACCENTS[rank] ?? 'lavender',
      link: {
        surface: 'bilan',
        params: bilanFacetParams('reco', [option.id]),
      },
    }));

  return {
    kind: 'answers',
    responded: feedback.respondedCount,
    rate: shareOf(feedback.respondedCount, feedback.total),
    answered,
    parts,
  };
}

/** The nine cards' figures for one event. */
export function eventHomeFigures(input: EventHomeInput): EventHomeFigures {
  const { rows } = input;

  const returning = rows
    .filter((r) => r.priorEnrolments > 0)
    .sort((a, b) => b.priorEnrolments - a.priorEnrolments || b.xp - a.xp)
    .slice(0, TOP_TALENTS)
    .map((r) => talent(r, parcoursLabel(r.priorEnrolments)));

  const topXp = rows
    .filter((r) => r.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, TOP_TALENTS)
    .map((r) => talent(r, NUMBER.format(r.xp)));

  return {
    total: rows.length,
    niveau: facetRing(rows, 'niveau'),
    genre: facetRing(rows, 'genre', {
      femme: 'tomorrow',
      homme: 'blue',
      autre: 'tech',
    }),
    lycees: facetBars(rows, 'lycee'),
    tech: facetBars(rows, 'tech'),
    returning,
    topXp,
    closings: input.closings ? closingsFigures(input.closings) : null,
    feedback: feedbackFigures(input.feedback),
  };
}

/** Where the cards' « Voir… » buttons go. */
export const HOME_LINKS = {
  allInscrits: inscrits({}),
  returning: inscrits(inscritsFacetParams('parcours', RETURNING_PARCOURS)),
  byXp: inscrits(inscritsSortParams('xp', 'desc')),
} satisfies Record<string, HomeLink>;
