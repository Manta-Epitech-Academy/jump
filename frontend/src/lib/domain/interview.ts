import type { InterviewRecommendation, InterviewStatus } from '@prisma/client';

/**
 * Single source of truth for the stage-de-seconde orientation interview.
 *
 * The questionnaire catalogue below (`INTERVIEW_SECTIONS` + `INTERVIEWER_SECTION`)
 * drives the conduct flow on the talent fiche AND the answer labels on the
 * list page. Each question's `field` matches an `Interview` column and the
 * matching key in `interviewConductSchema`, so the flow renderer is one loop
 * and there is no parallel label list to keep in sync.
 *
 * Register: question prompts are read aloud to the student, so they tutoient
 * ("Comment as-tu connu ce stage ?"). The staff controls around them vouvoient.
 */

/** Sentiment of an ordinal answer, driving a green→amber→red chip so the
 *  interviewer reads the valence at a glance. Set only on scale questions
 *  (oui / un peu / pas du tout); categorical options omit it, since color there
 *  would imply a ranking that isn't real (one channel isn't "better" than
 *  another). */
export type ChoiceTone = 'positive' | 'neutral' | 'negative';

/** Domain-identity glyph for the tech-domain questions, mapped to a Lucide icon
 *  in the flow (token → component, the same indirection as the verdict's tone
 *  token, so no icon components leak into this domain module). Set only where a
 *  clean glyph exists; brand answers (TikTok, ONISEP) have none and stay
 *  text-only rather than reaching for an emoji. */
export type ChoiceIconToken =
  | 'dev'
  | 'cyber'
  | 'design'
  | 'ia'
  | 'jeux_video'
  | 'reseaux'
  | 'pas_idee'
  | 'hors_tech';

export type ChoiceOption = {
  value: string;
  label: string;
  tone?: ChoiceTone;
  icon?: ChoiceIconToken;
};

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
  hint?: string;
  options: ChoiceOption[];
  reveal?: Reveal;
};

export type RatingQuestion = {
  kind: 'rating';
  field: 'satisfactionStars';
  label: string;
  hint?: string;
  max: number;
};

export type TextQuestion = {
  kind: 'text';
  field: string;
  label: string;
  hint?: string;
  placeholder?: string;
  maxLength: number;
};

export type InterviewQuestion = ChoiceQuestion | RatingQuestion | TextQuestion;

export type InterviewSection = {
  key: string;
  title: string;
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

/** The four student-facing sections of the conduct flow, in order. The verdict
 *  ("Avis de l'interviewer", `INTERVIEWER_SECTION`) is a fifth, staff-only step
 *  rendered apart. All questions are equal weight — there is no longer an
 *  "incontournable" tier. */
export const INTERVIEW_SECTIONS: readonly InterviewSection[] = [
  {
    key: 'motivation',
    title: 'Motivation',
    questions: [
      {
        kind: 'single',
        field: 'discoveryChannel',
        label: 'Comment as-tu connu ce stage ?',
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
    title: 'Lycée',
    questions: [
      {
        kind: 'multi',
        field: 'specialties',
        label: 'Spécialités envisagées (1re / terminale)',
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
          { value: 'souvent', label: 'Oui, souvent', tone: 'positive' },
          { value: 'un_peu', label: 'Un peu', tone: 'neutral' },
          { value: 'pas_du_tout', label: 'Pas du tout', tone: 'negative' },
        ],
      },
      {
        kind: 'single',
        field: 'passionateTeacher',
        label:
          'Dans ton lycée, un prof de maths ou de NSI qui organise plein de choses ?',
        hint: 'Un prof passionné, qui aime monter des concours ou des challenges : on aimerait organiser des ateliers avec ton lycée.',
        options: [
          { value: 'oui', label: 'Oui', tone: 'positive' },
          {
            value: 'pas_sur',
            label: 'Je ne vois pas / pas sûr·e',
            tone: 'neutral',
          },
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
    key: 'orientation',
    title: 'Orientation',
    questions: [
      {
        kind: 'single',
        field: 'techProjection',
        label: 'Vers quels métiers / domaines tu te projettes ?',
        options: [
          { value: 'dev', label: 'Dev', icon: 'dev' },
          { value: 'cyber', label: 'Cyber', icon: 'cyber' },
          { value: 'ia_data', label: 'IA / Data', icon: 'ia' },
          { value: 'jeux_video', label: 'Jeux vidéo', icon: 'jeux_video' },
          { value: 'design', label: 'Design', icon: 'design' },
          {
            value: 'reseaux_systemes',
            label: 'Réseaux / Systèmes',
            icon: 'reseaux',
          },
          { value: 'pas_idee', label: 'Pas encore d’idée', icon: 'pas_idee' },
          { value: 'hors_tech', label: 'Plutôt hors tech', icon: 'hors_tech' },
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
    key: 'retour',
    title: 'Retour',
    questions: [
      {
        kind: 'single',
        field: 'wantsMore',
        label: 'Ça t’a donné envie d’aller plus loin dans la tech ?',
        options: [
          { value: 'oui', label: 'Oui carrément', tone: 'positive' },
          { value: 'peut_etre', label: 'Peut-être', tone: 'neutral' },
          {
            value: 'pas_maintenant',
            label: 'Pas pour le moment',
            tone: 'negative',
          },
        ],
      },
      {
        kind: 'rating',
        field: 'satisfactionStars',
        label: 'Satisfaction globale du stage',
        max: 5,
      },
      {
        kind: 'text',
        field: 'oneSentence',
        label: 'Le stage en une phrase',
        hint: 'Idéal pour un témoignage com.',
        placeholder: 'La phrase du stagiaire, mot pour mot…',
        maxLength: INTERVIEW_TEXT_LIMITS.oneSentence,
      },
      {
        kind: 'multi',
        field: 'nextYearEvents',
        label:
          'L’an prochain, à quel type d’événement aimerais-tu participer ?',
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

/** A choice question that unlocks free-text inputs (its `reveal` is present). */
export type RevealQuestion = ChoiceQuestion & { reveal: Reveal };

/** Every reveal-bearing question, flattened. The conduct action loops this to
 *  trim each reveal field and null it when its trigger choice is deselected, so
 *  a precision never outlives the answer that unlocked it (e.g. a leftover
 *  `discoveryChannelOther` after switching away from "Autre"). Catalogue-driven:
 *  a new "Autre" precision is wired by adding a `reveal`, not by touching the
 *  action. */
export const REVEAL_QUESTIONS: readonly RevealQuestion[] =
  INTERVIEW_SECTIONS.flatMap((s) => s.questions).filter(
    (q): q is RevealQuestion =>
      (q.kind === 'single' || q.kind === 'multi') && q.reveal != null,
  );

/** Whether a reveal's trigger is satisfied by the current answer. Single-choice
 *  answers match by equality; multi-choice arrays by membership. Shared by the
 *  flow (show the inputs) and the action (clear them when the trigger is off) so
 *  the two can never disagree on when a precision is live. */
export function isRevealActive(reveal: Reveal, value: unknown): boolean {
  return Array.isArray(value)
    ? value.includes(reveal.when)
    : value === reveal.when;
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

// ─── Recommendation (profile compatibility) ───

export type RecommendationToneToken =
  | 'epi-tech'
  | 'epi-blue'
  | 'epi-tomorrow'
  | 'epi-drift';

/** Face glyph for the recommendation options, mapped to a Lucide icon in the
 *  verdict step (token kept out of this module, like the chip icons). The four
 *  faces climb from frown to laugh, so the verdict row reads as a left→right
 *  scale once ordered by `INTERVIEW_RECOMMENDATION_DISPLAY_ORDER`. */
export type RecommendationIconToken = 'frown' | 'meh' | 'smile' | 'laugh';

export type RecommendationDescriptor = {
  label: string;
  short: string;
  tone: RecommendationToneToken;
  icon: RecommendationIconToken;
};

export const INTERVIEW_RECOMMENDATIONS: Record<
  InterviewRecommendation,
  RecommendationDescriptor
> = {
  tres_compatible: {
    label: '100 % compatible Epitech',
    short: 'Compatible',
    tone: 'epi-tech',
    icon: 'laugh',
  },
  bon_profil: {
    label: 'Bon profil à suivre',
    short: 'À suivre',
    tone: 'epi-blue',
    icon: 'smile',
  },
  indecis: {
    label: 'Indécis',
    short: 'Indécis',
    tone: 'epi-drift',
    icon: 'meh',
  },
  pas_interesse: {
    label: 'Pas intéressé',
    short: 'Pas intéressé',
    tone: 'epi-tomorrow',
    icon: 'frown',
  },
};

export const INTERVIEW_RECOMMENDATION_VALUES = Object.keys(
  INTERVIEW_RECOMMENDATIONS,
) as InterviewRecommendation[];

/** The recommendations ordered worst → best, so the verdict step renders them
 *  left-to-right as a rising scale (frown → laugh). Separate from
 *  `INTERVIEW_RECOMMENDATION_VALUES` (object-key order), which the cohort
 *  synthesis iterates and must stay stable. */
export const INTERVIEW_RECOMMENDATION_DISPLAY_ORDER: readonly InterviewRecommendation[] =
  ['pas_interesse', 'indecis', 'bon_profil', 'tres_compatible'];

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
