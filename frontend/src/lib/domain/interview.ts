import type { InterviewRecommendation, InterviewStatus } from '@prisma/client';

/**
 * Single source of truth for the stage-de-seconde orientation interview.
 *
 * The questionnaire catalogue below (`INTERVIEW_SECTIONS` + `VERDICT_SECTION`)
 * drives the conduct flow on the talent fiche AND the answer labels on the
 * list page. Each question's `field` matches an `Interview` column and the
 * matching key in `interviewConductSchema`, so the flow renderer is one loop
 * and there is no parallel label list to keep in sync.
 *
 * Register: question prompts are read aloud to the student, so they tutoient
 * ("Comment as-tu connu ce stage ?"). The staff controls around them vouvoient.
 */

/** Sentiment of an ordinal answer, driving a green→amber→red chip so the
 *  staff reads the valence at a glance. Set only on scale questions
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

/** Every per-question free-text note column on the `Interview` row. The union
 *  (not a bare `string`) keeps the conduct prefill + persist typed against the
 *  real columns, so a typo can't silently write to nothing. */
export type NoteField =
  | 'discoveryChannelNote'
  | 'motivationNote'
  | 'specialtiesNote'
  | 'orientationTalkNote'
  | 'passionateTeacherNote'
  | 'techProjectionNote'
  | 'otherJobsNote'
  | 'infoSourcesNote'
  | 'wantsMoreNote'
  | 'satisfactionNote'
  | 'nextYearEventsNote';

/** A free-text note shown under a question, always (no longer gated by a choice
 *  the way the old "Autre"/teacher reveals were). The dev jots anything the chips
 *  don't capture, including the precision behind an "Autre" pick. `field` is the
 *  matching `Interview` column; `placeholder` is tailored to its question. */
export type QuestionNote = {
  field: NoteField;
  placeholder: string;
  maxLength: number;
};

export type ChoiceQuestion = {
  kind: 'single' | 'multi';
  field: string;
  label: string;
  hint?: string;
  options: ChoiceOption[];
  note?: QuestionNote;
};

export type RatingQuestion = {
  kind: 'rating';
  field: 'satisfactionStars';
  label: string;
  hint?: string;
  max: number;
  note?: QuestionNote;
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
 * action would reject (which would otherwise silently fail the autosave,
 * stranding the edit).
 */
export const INTERVIEW_TEXT_LIMITS = {
  oneSentence: 2000,
  verdictNote: 2000,
} as const;

/** Character ceiling for the per-question notes. Generous next to the old
 *  120-char "Autre" precision (the dev now writes the colour of the answer
 *  here), but short of the 2000-char testimony/verdict boxes: a note, not an
 *  essay. Shared by the Zod schema (server guard) and each input's `maxlength`
 *  (client guard), so the form can never hold a value the action would reject. */
export const INTERVIEW_NOTE_LIMIT = 500;

/** The four student-facing sections of the conduct flow, in order. The verdict
 *  ("Avis de l'équipe", `VERDICT_SECTION`) is a fifth, staff-only step
 *  rendered apart. All questions are equal weight. There is no longer an
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
        note: {
          field: 'discoveryChannelNote',
          placeholder: 'Autre canal, ou une précision sur sa réponse…',
          maxLength: INTERVIEW_NOTE_LIMIT,
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
        note: {
          field: 'motivationNote',
          placeholder: 'Ce qui ressort de sa motivation…',
          maxLength: INTERVIEW_NOTE_LIMIT,
        },
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
        note: {
          field: 'specialtiesNote',
          placeholder: 'Autre spécialité, ou un détail…',
          maxLength: INTERVIEW_NOTE_LIMIT,
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
        note: {
          field: 'orientationTalkNote',
          placeholder: 'Ce qu’on lui dit, et par qui…',
          maxLength: INTERVIEW_NOTE_LIMIT,
        },
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
        note: {
          field: 'passionateTeacherNote',
          placeholder: 'Nom du prof, matière, ce qu’il organise…',
          maxLength: INTERVIEW_NOTE_LIMIT,
        },
      },
    ],
  },
  {
    key: 'orientation',
    title: 'Orientation',
    questions: [
      {
        kind: 'multi',
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
        note: {
          field: 'techProjectionNote',
          placeholder: 'Un métier précis, une nuance…',
          maxLength: INTERVIEW_NOTE_LIMIT,
        },
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
        note: {
          field: 'otherJobsNote',
          placeholder: 'Autre métier, ou une précision…',
          maxLength: INTERVIEW_NOTE_LIMIT,
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
        note: {
          field: 'infoSourcesNote',
          placeholder: 'Autre source, un compte qu’il suit…',
          maxLength: INTERVIEW_NOTE_LIMIT,
        },
      },
    ],
  },
  {
    key: 'retour',
    title: 'Retour sur le stage',
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
        note: {
          field: 'wantsMoreNote',
          placeholder: 'Ce qui motive ou freine son envie…',
          maxLength: INTERVIEW_NOTE_LIMIT,
        },
      },
      {
        kind: 'rating',
        field: 'satisfactionStars',
        label: 'Satisfaction globale du stage',
        max: 5,
        note: {
          field: 'satisfactionNote',
          placeholder: 'Ce qui explique sa note…',
          maxLength: INTERVIEW_NOTE_LIMIT,
        },
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
        note: {
          field: 'nextYearEventsNote',
          placeholder: 'Un autre format, une envie précise…',
          maxLength: INTERVIEW_NOTE_LIMIT,
        },
      },
    ],
  },
] as const;

/** Section order for the read-only synthesis (the dev recap and the PDF
 *  export), deliberately distinct from the conduct order above. The conduct
 *  flow opens on "Motivation" to warm the student up; the synthesis instead
 *  leads with "Retour sur le stage" (the freshest takeaway), then motivation,
 *  orientation, and the lycée context last. Single source for both synthesis
 *  surfaces so they can never drift. Any section absent from this list is
 *  appended, so a new conduct section is never silently dropped from the
 *  synthesis. */
const SYNTHESIS_SECTION_ORDER = [
  'retour',
  'motivation',
  'orientation',
  'lycee',
];

export const INTERVIEW_SYNTHESIS_SECTIONS: readonly InterviewSection[] = [
  ...INTERVIEW_SECTIONS,
].sort((a, b) => {
  const rank = (key: string) => {
    const i = SYNTHESIS_SECTION_ORDER.indexOf(key);
    return i === -1 ? SYNTHESIS_SECTION_ORDER.length : i;
  };
  return rank(a.key) - rank(b.key);
});

/** Every per-question note column, flattened from the catalogue. The conduct
 *  action loops this to trim each note and store '' as null. The notes are
 *  ungated (always shown), so unlike the old reveals there is nothing to clear on
 *  a deselect: the rule is simply '' -> null. Catalogue-driven: a new note is
 *  wired by adding a `note` block, not by touching the action. */
export const NOTE_FIELDS: readonly NoteField[] = INTERVIEW_SECTIONS.flatMap(
  (s) => s.questions,
)
  .map((q) => ('note' in q ? q.note?.field : undefined))
  .filter((f): f is NoteField => f != null);

/** Staff-only verdict block, filled after the interview (never asked to the
 *  student). The recommendation is the single most actionable signal for
 *  follow-up; the note is the "why" behind it. */
export const VERDICT_SECTION = {
  title: 'Avis de l’équipe',
  subtitle: 'À chaud, après l’entretien. Non visible par le talent.',
  noteField: 'verdictNote',
  noteLabel: 'Note rapide',
  notePlaceholder:
    'Le « pourquoi » de l’avis (ex. « très motivé mais hésite avec médecine », « à relancer pour la JPO »).',
  noteMaxLength: INTERVIEW_TEXT_LIMITS.verdictNote,
} as const;

// ─── Recommendation (profile compatibility) ───

export type RecommendationToneToken =
  | 'epi-tech'
  | 'epi-blue'
  | 'epi-tomorrow'
  | 'epi-drift';

/** Face glyph for the recommendation options, mapped to a Lucide icon in the
 *  verdict step (token kept out of this module, like the chip icons). The faces
 *  run laugh → frown across the row, since `INTERVIEW_RECOMMENDATION_DISPLAY_ORDER`
 *  leads with the most compatible profile. */
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

/** The recommendations ordered best → worst, so the verdict step leads with
 *  "100 % compatible" and ends on "Pas intéressé". Separate from
 *  `INTERVIEW_RECOMMENDATION_VALUES` (object-key order), which the cohort
 *  synthesis iterates and must stay stable. */
export const INTERVIEW_RECOMMENDATION_DISPLAY_ORDER: readonly InterviewRecommendation[] =
  ['tres_compatible', 'bon_profil', 'indecis', 'pas_interesse'];

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
 *  (action pending), done = epi-tech (gate cleared). */
export const INTERVIEW_STATUS_CHIP_CLASS: Record<InterviewListStatus, string> =
  {
    todo: 'border-border bg-muted text-muted-foreground',
    in_progress: 'border-warning/30 bg-warning/10 text-warning',
    done: 'border-epi-tech/30 bg-epi-tech/10 text-epi-tech-ink',
  };
