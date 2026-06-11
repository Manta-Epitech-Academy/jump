import type { InterviewRecommendation, InterviewStatus } from '@prisma/client';

/**
 * Single source of truth for the stage-de-seconde orientation interview.
 *
 * The questionnaire catalogue below (`INTERVIEW_BLOCS` + `INTERVIEWER_SECTION`)
 * drives the conduct grid on the talent fiche AND the answer labels on the
 * list page. Each question's `field` matches an `Interview` column and the
 * matching key in `interviewConductSchema`, so the grid renderer is one loop
 * and there is no parallel label list to keep in sync.
 *
 * Register: question prompts are read aloud to the student, so they tutoient
 * ("Comment as-tu connu ce stage ?"). The staff controls around them vouvoient.
 */

export type ChoiceOption = { value: string; label: string };

/** Every free-text column unlocked by a choice answer. The union (not a bare
 *  `string`) keeps the conduct action's reveal-clearing loop typed against the
 *  real `Interview` columns, so a typo can't silently write to nothing. */
export type RevealTextField =
  | 'teacherName'
  | 'teacherSubject'
  | 'discoveryChannelOther'
  | 'specialtiesOther'
  | 'otherJobsOther'
  | 'infoSourcesOther';

/** A free-text input unlocked by a specific choice answer (e.g. the
 *  passionate-teacher name/subject when the answer is "oui", or the "Précisez"
 *  box that appears once the student picks "Autre"). */
export type RevealField = {
  field: RevealTextField;
  label: string;
  placeholder?: string;
  maxLength: number;
};

/** A choice answer that unlocks free-text inputs. `when` is matched by equality
 *  for single-choice questions and by membership for multi-choice (so the
 *  "Autre" precision shows the moment "Autre" is among the picks). */
export type Reveal = { when: string; fields: RevealField[] };

export type ChoiceQuestion = {
  kind: 'single' | 'multi';
  field: string;
  label: string;
  /** ★ in the guide: skip the unmarked questions first if time runs short. */
  essential?: boolean;
  hint?: string;
  options: ChoiceOption[];
  reveal?: Reveal;
};

export type RatingQuestion = {
  kind: 'rating';
  field: 'satisfactionStars';
  label: string;
  essential?: boolean;
  hint?: string;
  max: number;
};

export type TextQuestion = {
  kind: 'text';
  field: string;
  label: string;
  essential?: boolean;
  hint?: string;
  placeholder?: string;
  maxLength: number;
};

export type InterviewQuestion = ChoiceQuestion | RatingQuestion | TextQuestion;

export type InterviewBloc = {
  key: string;
  title: string;
  /** Pacing budget from the guide's déroulé, in seconds. Single source: the
   *  bloc meta string is derived via `formatBlocDuration`, and the rail's live
   *  minuteur sums these into `INTERVIEW_TOTAL_SECONDS` (the 10-min target). */
  durationSeconds: number;
  questions: InterviewQuestion[];
};

/**
 * Character ceilings for the interview's free-text fields. Single source for
 * both the Zod schema (server guard, `validation/interviews.ts`) and the
 * inputs' `maxlength` (client guard), so the form can never hold a value the
 * action would reject (which would otherwise silently fail the autosave and
 * block the abandon escape-hatch).
 */
export const INTERVIEW_TEXT_LIMITS = {
  teacherName: 120,
  teacherSubject: 120,
  // The "Précisez" box shown when "Autre" is picked: a short clarification
  // (a channel, a specialty, a métier), never a paragraph.
  otherChoice: 120,
  oneSentence: 2000,
  interviewerNote: 2000,
} as const;

export const INTERVIEW_BLOCS: readonly InterviewBloc[] = [
  {
    key: 'decouverte',
    title: 'Découverte & motivation',
    durationSeconds: 90,
    questions: [
      {
        kind: 'single',
        field: 'discoveryChannel',
        label: 'Comment as-tu connu ce stage ?',
        essential: true,
        options: [
          { value: 'site_1e1s', label: 'Site 1élève1stage' },
          { value: 'entourage', label: 'Mon entourage' },
          { value: 'google', label: 'Recherche Google' },
          { value: 'epitech', label: 'Par Epitech' },
          { value: 'autre', label: 'Autre' },
        ],
        reveal: {
          when: 'autre',
          fields: [
            {
              field: 'discoveryChannelOther',
              label: 'Précisez',
              placeholder: 'Par quel moyen ?',
              maxLength: INTERVIEW_TEXT_LIMITS.otherChoice,
            },
          ],
        },
      },
      {
        kind: 'single',
        field: 'motivation',
        label: 'Qu’est-ce qui te motive à te former dans la tech ?',
        essential: true,
        options: [
          { value: 'passion', label: 'J’adore la tech, c’est ma passion' },
          { value: 'metier', label: 'Je veux en faire mon métier' },
          { value: 'curiosite', label: 'Je suis curieux·se par nature' },
          { value: 'cadre_stage', label: 'Juste dans le cadre du stage' },
        ],
      },
    ],
  },
  {
    key: 'lycee',
    title: 'Lycée & parcours',
    durationSeconds: 120,
    questions: [
      {
        kind: 'multi',
        field: 'specialties',
        label: 'Spécialités envisagées (1re / terminale)',
        essential: true,
        options: [
          { value: 'maths', label: 'Maths' },
          { value: 'nsi', label: 'NSI' },
          { value: 'physique_chimie', label: 'Physique-Chimie' },
          { value: 'svt', label: 'SVT' },
          { value: 'ses', label: 'SES' },
          { value: 'sciences_ingenieur', label: 'Sciences de l’ingénieur' },
          { value: 'autre', label: 'Autre' },
          { value: 'indecis', label: 'Pas encore décidé' },
        ],
        reveal: {
          when: 'autre',
          fields: [
            {
              field: 'specialtiesOther',
              label: 'Précisez',
              placeholder: 'Quelle spécialité ?',
              maxLength: INTERVIEW_TEXT_LIMITS.otherChoice,
            },
          ],
        },
      },
      {
        kind: 'single',
        field: 'orientationTalkAtSchool',
        label: 'On te parle d’orientation vers la tech dans ton lycée ?',
        options: [
          { value: 'souvent', label: 'Oui, souvent' },
          { value: 'un_peu', label: 'Un peu' },
          { value: 'pas_du_tout', label: 'Pas du tout' },
        ],
      },
      {
        kind: 'single',
        field: 'passionateTeacher',
        label:
          'Dans ton lycée, un prof de maths ou de NSI qui organise plein de choses ?',
        essential: true,
        hint: 'Un prof passionné, qui aime monter des concours ou des challenges : on aimerait organiser des ateliers avec ton lycée.',
        options: [
          { value: 'oui', label: 'Oui' },
          { value: 'pas_sur', label: 'Je ne vois pas / pas sûr·e' },
        ],
        reveal: {
          when: 'oui',
          fields: [
            {
              field: 'teacherName',
              label: 'Nom du prof',
              placeholder: 'Nom',
              maxLength: INTERVIEW_TEXT_LIMITS.teacherName,
            },
            {
              field: 'teacherSubject',
              label: 'Matière',
              placeholder: 'Maths, NSI…',
              maxLength: INTERVIEW_TEXT_LIMITS.teacherSubject,
            },
          ],
        },
      },
    ],
  },
  {
    key: 'projet',
    title: 'Projet d’orientation',
    durationSeconds: 150,
    questions: [
      {
        kind: 'single',
        field: 'techProjection',
        label: 'Vers quels métiers / domaines tu te projettes ?',
        essential: true,
        options: [
          { value: 'dev', label: 'Dev' },
          { value: 'cyber', label: 'Cyber' },
          { value: 'ia_data', label: 'IA / Data' },
          { value: 'jeux_video', label: 'Jeux vidéo' },
          { value: 'design', label: 'Design' },
          { value: 'reseaux_systemes', label: 'Réseaux / Systèmes' },
          { value: 'pas_idee', label: 'Pas encore d’idée' },
          { value: 'hors_tech', label: 'Plutôt hors tech' },
        ],
      },
      {
        kind: 'multi',
        field: 'otherJobs',
        label: 'Quels autres métiers (hors tech) t’intéressent ?',
        options: [
          { value: 'sante', label: 'Santé' },
          { value: 'commerce_gestion', label: 'Commerce / Gestion' },
          { value: 'arts_design', label: 'Arts / Design' },
          { value: 'sport', label: 'Sport' },
          { value: 'autre', label: 'Autre' },
        ],
        reveal: {
          when: 'autre',
          fields: [
            {
              field: 'otherJobsOther',
              label: 'Précisez',
              placeholder: 'Quel métier ?',
              maxLength: INTERVIEW_TEXT_LIMITS.otherChoice,
            },
          ],
        },
      },
      {
        kind: 'multi',
        field: 'infoSources',
        label: 'Où t’informes-tu sur ton orientation et les métiers ?',
        essential: true,
        options: [
          { value: 'tiktok', label: 'TikTok' },
          { value: 'instagram', label: 'Instagram' },
          { value: 'youtube', label: 'YouTube' },
          { value: 'google', label: 'Google' },
          { value: 'ia_chatgpt', label: 'IA / ChatGPT' },
          { value: 'parcoursup_onisep', label: 'Parcoursup / ONISEP' },
          { value: 'entourage', label: 'Mon entourage' },
          { value: 'lycee', label: 'Mon lycée' },
          { value: 'autre', label: 'Autre' },
        ],
        reveal: {
          when: 'autre',
          fields: [
            {
              field: 'infoSourcesOther',
              label: 'Précisez',
              placeholder: 'Quelle source ?',
              maxLength: INTERVIEW_TEXT_LIMITS.otherChoice,
            },
          ],
        },
      },
    ],
  },
  {
    key: 'domaines',
    title: 'Attrait pour les domaines du stage',
    durationSeconds: 90,
    questions: [
      {
        kind: 'single',
        field: 'weekFavorite',
        label: 'Quel domaine de la semaine t’a le plus parlé ?',
        essential: true,
        options: [
          { value: 'cyber', label: 'Cyber' },
          { value: 'dev', label: 'Dev' },
          { value: 'devops', label: 'DevOps' },
          { value: 'product_design', label: 'Product design' },
          { value: 'ia', label: 'IA' },
        ],
      },
      {
        kind: 'single',
        field: 'wantsMore',
        label: 'Ça t’a donné envie d’aller plus loin dans la tech ?',
        options: [
          { value: 'oui', label: 'Oui carrément' },
          { value: 'peut_etre', label: 'Peut-être' },
          { value: 'pas_maintenant', label: 'Pas pour le moment' },
        ],
      },
    ],
  },
  {
    key: 'retour',
    title: 'Retour sur le stage',
    durationSeconds: 90,
    questions: [
      {
        kind: 'rating',
        field: 'satisfactionStars',
        label: 'Satisfaction globale du stage',
        essential: true,
        max: 5,
      },
      {
        kind: 'single',
        field: 'satisfactionContent',
        label: 'Le contenu du stage',
        essential: true,
        options: [
          { value: 'trop_facile', label: 'Trop facile' },
          { value: 'bon_niveau', label: 'Bon niveau' },
          { value: 'trop_dense', label: 'Trop dense' },
        ],
      },
      {
        kind: 'text',
        field: 'oneSentence',
        label: 'Le stage en une phrase',
        hint: 'Idéal pour un témoignage com.',
        placeholder: 'La phrase du stagiaire, mot pour mot…',
        maxLength: INTERVIEW_TEXT_LIMITS.oneSentence,
      },
    ],
  },
  {
    key: 'contact',
    title: 'Garder le contact',
    durationSeconds: 30,
    questions: [
      {
        kind: 'multi',
        field: 'nextYearEvents',
        label:
          'L’an prochain, à quel type d’événement aimerais-tu participer ?',
        essential: true,
        options: [
          { value: 'coding_club', label: 'Coding Club' },
          { value: 'camp', label: 'Camp' },
          { value: 'journee_decouverte', label: 'Journée Découverte' },
          { value: 'jpo', label: 'JPO' },
          { value: 'conference', label: 'Conférence' },
        ],
      },
    ],
  },
] as const;

/** Render a bloc's `durationSeconds` as the French pacing meta shown on the
 *  grid ("1 min 30", "2 min", "30 s"). The seconds are the source; this is the
 *  only place that stringifies them, so the meta can never drift from the
 *  minuteur's total. */
export function formatBlocDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest}`;
}

/** Sum of the bloc budgets: the interview's pacing target (9 min 30 of
 *  questions, the verdict fills the last 30 s of the guide's "10 minutes").
 *  The rail's minuteur counts elapsed time against this. */
export const INTERVIEW_TOTAL_SECONDS = INTERVIEW_BLOCS.reduce(
  (sum, bloc) => sum + bloc.durationSeconds,
  0,
);

/** DOM ids for the conduct grid's bloc sections + the interviewer verdict, so
 *  the right rail's section nav can scroll to them. Shared so the anchor the
 *  grid renders and the target the nav jumps to can never disagree. */
export const interviewBlocAnchorId = (key: string) => `interview-bloc-${key}`;
export const INTERVIEW_VERDICT_ANCHOR_ID = 'interview-verdict';

/** A choice question that unlocks free-text inputs (its `reveal` is present). */
export type RevealQuestion = ChoiceQuestion & { reveal: Reveal };

/** Every reveal-bearing question, flattened. The conduct action loops this to
 *  trim each reveal field and null it when its trigger choice is deselected, so
 *  a precision never outlives the answer that unlocked it (e.g. a leftover
 *  `discoveryChannelOther` after switching away from "Autre"). Catalogue-driven:
 *  a new "Autre" precision is wired by adding a `reveal`, not by touching the
 *  action. */
export const REVEAL_QUESTIONS: readonly RevealQuestion[] =
  INTERVIEW_BLOCS.flatMap((b) => b.questions).filter(
    (q): q is RevealQuestion =>
      (q.kind === 'single' || q.kind === 'multi') && q.reveal != null,
  );

/** Whether a reveal's trigger is satisfied by the current answer. Single-choice
 *  answers match by equality; multi-choice arrays by membership. Shared by the
 *  grid (show the inputs) and the action (clear them when the trigger is off) so
 *  the two can never disagree on when a precision is live. */
export function isRevealActive(reveal: Reveal, value: unknown): boolean {
  return Array.isArray(value)
    ? value.includes(reveal.when)
    : value === reveal.when;
}

// ─── ★-progress (shared by the grid's close-gate and the rail's section nav) ───

/** Per-bloc count of answered incontournables, for the rail's section nav. */
export type SectionProgress = {
  key: string;
  title: string;
  done: number;
  total: number;
};

/** The interview's ★-progress: per-bloc essentials plus the interviewer's
 *  recommendation (an essential that lives outside the blocs). `done`/`total`
 *  are the grand totals the close-gate compares; `sections` + `verdictDone`
 *  drive the rail's section nav. One computation so the meter, the nav and the
 *  "il reste N incontournables" warning can never disagree. */
export type InterviewProgressSummary = {
  done: number;
  total: number;
  sections: SectionProgress[];
  verdictDone: boolean;
};

/** Whether an incontournable holds an answer: a non-empty array for multi, any
 *  non-empty value otherwise (a picked chip, a star rating). */
function isAnswered(question: InterviewQuestion, value: unknown): boolean {
  if (question.kind === 'multi') {
    return Array.isArray(value) && value.length > 0;
  }
  return value != null && value !== '';
}

/** Compute ★-progress from a flat form-values record (the conduct form). Pure
 *  and catalogue-driven: a new ★ question or bloc is counted by adding it to
 *  `INTERVIEW_BLOCS`, never by touching the grid or the rail. */
export function computeInterviewProgress(
  values: Record<string, unknown>,
): InterviewProgressSummary {
  const sections = INTERVIEW_BLOCS.map((bloc) => {
    const essentials = bloc.questions.filter((q) => q.essential);
    const done = essentials.filter((q) =>
      isAnswered(q, values[q.field]),
    ).length;
    return { key: bloc.key, title: bloc.title, done, total: essentials.length };
  });
  const verdictDone = values.recommendation != null;
  const blocDone = sections.reduce((n, s) => n + s.done, 0);
  const blocTotal = sections.reduce((n, s) => n + s.total, 0);
  return {
    sections,
    verdictDone,
    // +1 for the interviewer's recommendation: an incontournable not in any bloc.
    done: blocDone + (verdictDone ? 1 : 0),
    total: blocTotal + 1,
  };
}

/** Interviewer-only block, filled after the interview (never asked to the
 *  student). The recommendation is the single most actionable signal for
 *  follow-up; the note is the "why" behind it. */
export const INTERVIEWER_SECTION = {
  title: 'Avis de l’interviewer',
  subtitle: 'À chaud, après l’entretien. Réservé à l’équipe.',
  noteField: 'interviewerNote',
  noteLabel: 'Note rapide',
  notePlaceholder:
    'Le « pourquoi » de l’avis (ex. « très motivé mais hésite avec médecine », « à relancer pour la JPO »).',
  noteMaxLength: INTERVIEW_TEXT_LIMITS.interviewerNote,
} as const;

// ─── Recommendation (Q15 — profile compatibility) ───

export type RecommendationToneToken =
  | 'epi-tech'
  | 'epi-blue'
  | 'epi-tomorrow'
  | 'epi-drift';

export type RecommendationDescriptor = {
  label: string;
  short: string;
  tone: RecommendationToneToken;
};

export const INTERVIEW_RECOMMENDATIONS: Record<
  InterviewRecommendation,
  RecommendationDescriptor
> = {
  tres_compatible: {
    label: '100 % compatible Epitech',
    short: 'Compatible',
    tone: 'epi-tech',
  },
  bon_profil: {
    label: 'Bon profil à suivre',
    short: 'À suivre',
    tone: 'epi-blue',
  },
  indecis: {
    label: 'Indécis',
    short: 'Indécis',
    tone: 'epi-drift',
  },
  pas_interesse: {
    label: 'Pas intéressé',
    short: 'Pas intéressé',
    tone: 'epi-tomorrow',
  },
};

export const INTERVIEW_RECOMMENDATION_VALUES = Object.keys(
  INTERVIEW_RECOMMENDATIONS,
) as InterviewRecommendation[];

// ─── List status (à faire / en cours / finalisé) ───

/** Display status for the list page. The DB only ever stores `in_progress`
 *  or `done`; the absence of an Interview row is "à faire" (todo). */
export type InterviewListStatus = 'todo' | 'in_progress' | 'done';

export function interviewListStatus(
  interview: { status: InterviewStatus } | null | undefined,
): InterviewListStatus {
  if (!interview) return 'todo';
  return interview.status;
}

export const INTERVIEW_STATUS_LABELS: Record<InterviewListStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Finalisé',
};

/** Chip classes mirror the inscrits page status badges so the two dev-space
 *  cohort tables share one color language: todo = neutral, in_progress = amber
 *  (action pending), done = epi-teal (gate cleared). */
export const INTERVIEW_STATUS_CHIP_CLASS: Record<InterviewListStatus, string> =
  {
    todo: 'border-border bg-muted text-muted-foreground',
    in_progress: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
    done: 'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid',
  };
