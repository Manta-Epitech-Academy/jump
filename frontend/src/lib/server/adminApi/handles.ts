/**
 * Where every value that names a row comes from.
 *
 * A handle is a value one operation returns and another consumes: an event id, a
 * form id, a preset name. This tier has exactly one consumer, a language model,
 * which cannot look a cuid up on a screen - so a parameter no answer produces is
 * not merely awkward, it is dead. `services/adminStats/configuration.ts` says as
 * much in prose ("a write that takes a form id or a preset name is unusable until
 * something returns them"), and prose is precisely what failed: the provenance of
 * an event id was written in nine places naming three different lists, none of
 * which mentioned the one operation that in fact returned it for the commonest
 * case, while a doctrine comment counted "five of these reads" against an actual
 * twelve.
 *
 * So the map is declared once, here, and everything else is derived from it: the
 * `.describe()` a model reads before choosing a tool, the French sentence a
 * refusal ends with, what `meta_operations` publishes as `requires` / `provides`,
 * and the guard in `handles.test.ts` that fails when a parameter has no producer
 * **its own tier can call**. That last clause is the one that matters: the hole
 * this closes had already happened once, when `stats_feedback_results` required a
 * form id obtainable only from a configuration answer national leadership cannot
 * reach.
 *
 * Deliberately not here: `campus` and `schoolYear`. They are vocabularies rather
 * than row handles - a closed list a caller picks from, published up front by
 * `meta_scope` and refused by value in `scope.ts`, which is this same job already
 * done properly for those two.
 */

import type { AdminApiOperationName } from './operations';

export type HandleKind =
  | 'eventId'
  | 'formId'
  | 'questionKey'
  | 'templateName'
  | 'pdfJobId'
  | 'syncErrorType'
  | 'moduleKey'
  | 'interviewId';

/**
 * Deliberately only the operation and the slice it covers, never where the value
 * sits in the answer.
 *
 * A field path was carried here at first and dropped: nothing consumed it, and
 * nothing could check it either. Verifying one needs a real answer with a
 * non-empty list in it, and half these lists are empty on any seeded fixture, so
 * the check would have passed on the rows it never reached - a guard that cannot
 * fail, guarding a comment that claimed it did. `covers` earns its place instead
 * by being read: it goes into the `describe()` a model sees.
 */
type Producer = {
  operation: AdminApiOperationName;
  /**
   * Which of them it emits, when it is not all of them. Absent means all. This is
   * the field the hand-written prose never had: naming a producer without saying
   * it only covers past events is how a parameter looks reachable and is not.
   */
  covers?: string;
};

type Handle = {
  /** English, opening the parameter's `describe()`: what the value is. */
  what: string;
  /** French, plural, for a refusal: "identifiants d'événement". */
  frNoun: string;
  producedBy: Producer[];
  /**
   * Set only when nothing returns it. An unobtainable handle is a defensible
   * design - it is how `ops_reset_interview` stays safe - but it has to be a
   * decision somebody wrote down, not an oversight that reads the same.
   */
  unobtainable?: { why: string; frSentence: string };
};

export const HANDLES: Record<HandleKind, Handle> = {
  eventId: {
    what: 'Event id.',
    frNoun: "identifiants d'événement",
    producedBy: [
      { operation: 'config_events' },
      { operation: 'stats_events' },
      {
        operation: 'config_unconfigured_events',
        covers: 'only events that still need work before their cohort arrives',
      },
      {
        operation: 'stats_attendance_rate',
        covers: 'only events that have already happened',
      },
      {
        operation: 'ops_emargement_coverage',
        covers: 'only events with the attendance section enabled',
      },
      {
        operation: 'stats_feedback_question',
        covers:
          'only when grouped by event, and only events that answered the question asked about',
      },
    ],
  },
  formId: {
    what: 'Feedback form id.',
    frNoun: 'identifiants de questionnaire',
    producedBy: [
      { operation: 'config_feedback_forms' },
      { operation: 'stats_feedback_results' },
    ],
  },
  questionKey: {
    what: 'A question\'s stable key inside its form, e.g. "reco". Its wording is not an identifier: it is phrased for students and editable per form.',
    frNoun: 'clés de question',
    producedBy: [{ operation: 'stats_feedback_results' }],
  },
  templateName: {
    what: 'Event configuration preset name, which is what identifies it.',
    frNoun: 'noms de modèle',
    producedBy: [{ operation: 'config_event_templates' }],
  },
  pdfJobId: {
    what: 'Document generation job id. It names a document, never a person.',
    frNoun: 'identifiants de génération',
    producedBy: [
      {
        operation: 'ops_pdf_jobs_health',
        covers: 'only jobs that can be retried, and only the most recent ones',
      },
    ],
  },
  syncErrorType: {
    what: 'Kind of synchronisation error.',
    frNoun: "types d'erreur de synchronisation",
    producedBy: [{ operation: 'stats_sync_health' }],
  },
  moduleKey: {
    what: 'Dev-workspace section key.',
    frNoun: 'clés de section',
    producedBy: [
      { operation: 'config_event_detail' },
      { operation: 'stats_events_overview' },
    ],
  },
  interviewId: {
    what: 'Interview id.',
    frNoun: "identifiants d'entretien",
    producedBy: [],
    unobtainable: {
      why: 'Read off the admin interviews page. No operation returns one, which is what keeps an irreversible delete out of a model reach: it can carry out a reset on an id a human handed it, never pick a target.',
      frSentence:
        "L'identifiant se lit sur la page des entretiens de l'espace admin : aucune opération n'en renvoie.",
    },
  },
};

/** Which parameter name carries which handle. The guard checks this is complete. */
export const PARAM_HANDLES: Record<string, HandleKind> = {
  eventId: 'eventId',
  formId: 'formId',
  question: 'questionKey',
  templateName: 'templateName',
  // `write_event_template` spells it `name`: the same preset name, which the
  // operation either creates or overwrites.
  name: 'templateName',
  jobId: 'pdfJobId',
  errorType: 'syncErrorType',
  modules: 'moduleKey',
  interviewId: 'interviewId',
};

const list = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;

/**
 * The English sentence a model reads on the parameter: what the value is, and
 * every operation that hands one out with the slice it covers.
 *
 * Every producer, not the one that comes to mind. Pointing an event id at
 * `config_unconfigured_events` alone is what left the parameter unusable for
 * anything already visible, and the reader had no way to know.
 */
export function handleDescribe(kind: HandleKind): string {
  const handle = HANDLES[kind];
  if (handle.unobtainable) return `${handle.what} ${handle.unobtainable.why}`;

  const sources = handle.producedBy
    .map((p) => (p.covers ? `${p.operation} (${p.covers})` : p.operation))
    .join(', ');
  return `${handle.what} Returned by: ${sources}.`;
}

/**
 * The French sentence a refusal ends with, so a caller handed "introuvable" is
 * also told where a working value comes from.
 *
 * Each site keeps its own opening sentence - "Événement « x » introuvable",
 * "Génération « x » introuvable" - because that part is specific and reads well.
 * What is generated is the list, which is the part that drifted.
 */
export function handleProvenanceFr(kind: HandleKind): string {
  const handle = HANDLES[kind];
  if (handle.unobtainable) return handle.unobtainable.frSentence;
  const ops = list(handle.producedBy.map((p) => p.operation));
  return `Les ${handle.frNoun} sont renvoyés par ${
    handle.producedBy.length > 1 ? 'les opérations' : "l'opération"
  } ${ops}.`;
}

/** The handles an operation hands out, for `meta_operations`. */
export function handlesProvidedBy(name: AdminApiOperationName): HandleKind[] {
  return (Object.keys(HANDLES) as HandleKind[]).filter((kind) =>
    HANDLES[kind].producedBy.some((p) => p.operation === name),
  );
}

/** The handles an operation's parameters consume, for `meta_operations`. */
export function handlesRequiredBy(paramNames: string[]): HandleKind[] {
  return [
    ...new Set(
      paramNames
        .map((param) => PARAM_HANDLES[param])
        .filter((kind): kind is HandleKind => kind !== undefined),
    ),
  ];
}
