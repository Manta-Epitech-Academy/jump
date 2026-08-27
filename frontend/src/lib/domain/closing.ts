import type { ClosingRecommendation, ClosingStatus } from '@prisma/client';
import {
  ANSWER_POLARITIES,
  isAnswerPolarity,
  optionPolarity,
  type AnswerPolarity,
} from './polarity';

/**
 * Everything about a closing that is NOT the questionnaire.
 *
 * The questionnaire itself moved to the database (`Closing_Question` is a bank of
 * questions, `Closing_Template` a composition over it), because the team composes
 * grids and a developer should not have to deploy for a new one. What stays in
 * code is what a runtime author cannot supply: the closed token vocabularies a
 * component resolves to classes and icons, the ceilings both sides validate
 * against, the staff-only verdict, and the projection that turns a stored grid
 * into the shape every renderer reads.
 *
 * Register: question prompts are read aloud to the student, so they tutoient
 * ("Comment as-tu connu cet événement ?"). The staff controls around them
 * vouvoient.
 */

// ─── Token vocabularies (closed: a runtime author may not invent one) ───

/** Sentiment of an ordinal answer, driving a green→amber→red chip so the staff
 *  reads the valence at a glance. Set only on scale questions (oui / un peu /
 *  pas du tout); categorical options omit it, since colour there would imply a
 *  ranking that isn't real (one channel isn't "better" than another).
 *
 *  The three levels are `domain/polarity`'s, shared with the feedback scales
 *  rather than re-declared: a bank question stores its valence where a scale
 *  derives it from position, but they are the same vocabulary and a fourth level
 *  would have to reach both. Re-exported under the closing name the DB column and
 *  the chips already use. */
export type ChoiceTone = AnswerPolarity;

export const CHOICE_TONES = ANSWER_POLARITIES;

export const isChoiceTone = isAnswerPolarity;

/** Domain-identity glyph for the tech-domain questions, mapped to a Lucide icon
 *  in the flow (token → component, the same indirection as the verdict's tone
 *  token, so no icon components leak into this module or into the database). Set
 *  only where a clean glyph exists; brand answers (TikTok, ONISEP) have none and
 *  stay text-only rather than reaching for an emoji. */
export type ChoiceIconToken =
  | 'dev'
  | 'cyber'
  | 'design'
  | 'ia'
  | 'jeux_video'
  | 'reseaux'
  | 'pas_idee'
  | 'hors_tech';

export const CHOICE_ICON_TOKENS: readonly ChoiceIconToken[] = [
  'dev',
  'cyber',
  'design',
  'ia',
  'jeux_video',
  'reseaux',
  'pas_idee',
  'hors_tech',
];

export function isChoiceIconToken(v: string): v is ChoiceIconToken {
  return (CHOICE_ICON_TOKENS as readonly string[]).includes(v);
}

export type ClosingQuestionKind = 'single' | 'multi' | 'rating' | 'text';

// ─── Ceilings ───

/**
 * Character ceiling for the per-question notes. Generous next to the old
 * 120-char "Autre" precision (the dev now writes the colour of the answer here),
 * but short of the 2000-char testimony/verdict boxes: a note, not an essay.
 * Shared by the Zod schema (server guard) and each input's `maxlength` (client
 * guard), so the form can never hold a value the action would reject.
 *
 * A ceiling rather than a per-question column because it describes the staff's
 * writing surface, which is the same on every question; a text ANSWER's ceiling
 * is per-question and lives on the bank row.
 */
export const CLOSING_NOTE_LIMIT = 500;

/** Ceiling for the team's verdict note, the one free-text field that is not an
 *  answer to a question. Same single-source role as `CLOSING_NOTE_LIMIT`. */
export const CLOSING_VERDICT_NOTE_LIMIT = 2000;

/** Ceiling applied to a `text` answer whose bank row names none. */
export const CLOSING_TEXT_LIMIT_DEFAULT = 2000;

// ─── The grid, as every renderer reads it ───

export type ClosingOption = {
  id: string;
  value: string;
  label: string;
  tone?: ChoiceTone;
  icon?: ChoiceIconToken;
};

/** The note a grid offers under a question. `null` = this grid asks for none. */
export type ClosingNoteField = {
  placeholder: string;
  maxLength: number;
};

export type ClosingQuestion = {
  /** The bank row's id. This is what an answer references, so it is the key the
   *  conduct form and every renderer address a question by. */
  id: string;
  /** The bank row's stable key, quoted by analytics and by the write operations. */
  key: string;
  kind: ClosingQuestionKind;
  /** What THIS grid reads aloud: the bank's label unless the composition
   *  overrides it for the format ("Satisfaction globale du stage"). */
  label: string;
  /** The bank's own wording, which is the name a figure is quoted under. Kept
   *  beside the prompt so an aggregate never has to pick between two labels. */
  canonicalLabel: string;
  hint: string | null;
  placeholder: string | null;
  /** `rating` only. */
  max: number | null;
  /** `text` only. */
  maxLength: number | null;
  options: ClosingOption[];
  note: ClosingNoteField | null;
  /** This question's free text is quotable (`stats_closing_testimonials`). */
  testimonial: boolean;
};

export type ClosingSection = {
  id: string;
  title: string;
  questions: ClosingQuestion[];
};

export type ClosingGrid = {
  templateId: string;
  key: string;
  label: string;
  /** Conduct order: the order the closing is walked in. */
  sections: ClosingSection[];
  /** Read-back order for the recap and the PDF, which a grid may set apart from
   *  the conduct order (`Closing_TemplateSection.synthesisPosition`). */
  synthesisSections: ClosingSection[];
};

/** The stored shape this module projects from, declared structurally so the
 *  domain stays free of Prisma payload types (the same reason
 *  `domain/feedbackForms/schema.ts` projects rather than re-exports). */
export type StoredClosingTemplate = {
  id: string;
  key: string;
  label: string;
  sections: {
    id: string;
    position: number;
    synthesisPosition: number | null;
    title: string;
    questions: {
      sectionId: string;
      position: number;
      labelOverride: string | null;
      withNote: boolean;
      question: {
        id: string;
        key: string;
        label: string;
        hint: string | null;
        kind: ClosingQuestionKind;
        max: number | null;
        maxLength: number | null;
        placeholder: string | null;
        notePlaceholder: string | null;
        testimonial: boolean;
        options: {
          id: string;
          value: string;
          label: string;
          tone: string | null;
          icon: string | null;
        }[];
      };
    }[];
  }[];
};

/**
 * A bank question as stored, independent of any composition.
 *
 * Named apart from the template it is reached through because an answer outlives
 * the composition that asked it: `Closing_Answer` references the BANK question,
 * so a question dropped from a grid still resolves to one of these even though
 * no `Closing_TemplateQuestion` points at it any more.
 */
export type StoredClosingQuestion =
  StoredClosingTemplate['sections'][number]['questions'][number]['question'];

/**
 * One bank question, in the shape every renderer reads.
 *
 * Shared by `toClosingGrid` (a question a grid asks, with the composition's own
 * wording) and `recordSynthesisSections` (a question it no longer asks). Both go
 * through here so a retired question cannot render under different rules than
 * the one beside it: same tone/icon guards, same ceilings, same fields.
 */
function projectQuestion(
  q: StoredClosingQuestion,
  composition: { label: string | null; withNote: boolean },
): ClosingQuestion {
  return {
    id: q.id,
    key: q.key,
    kind: q.kind,
    label: composition.label?.trim() || q.label,
    canonicalLabel: q.label,
    hint: q.hint,
    placeholder: q.placeholder,
    max: q.max,
    maxLength: q.maxLength,
    testimonial: q.testimonial,
    options: q.options.map((o) => ({
      id: o.id,
      value: o.value,
      label: o.label,
      ...(o.tone && isChoiceTone(o.tone) ? { tone: o.tone } : {}),
      ...(o.icon && isChoiceIconToken(o.icon) ? { icon: o.icon } : {}),
    })),
    note:
      composition.withNote && q.notePlaceholder
        ? {
            placeholder: q.notePlaceholder,
            maxLength: CLOSING_NOTE_LIMIT,
          }
        : null,
  };
}

/**
 * Turn a stored grid into the shape the conduct flow, the recap and the PDF all
 * read. One projection, shared by every surface, so none of them can disagree
 * about what a grid asks (the role `projectQuestionToSchema` plays for feedback).
 *
 * An unknown `tone` or `icon` is dropped rather than passed through: those tokens
 * index closed maps in the components, so a stray value would resolve to
 * `undefined` and render an unstyled chip. The write operation refuses one at
 * authoring time; this is the second half of that guarantee, for a row written
 * before a token was retired.
 */
export function toClosingGrid(template: StoredClosingTemplate): ClosingGrid {
  const sections = [...template.sections]
    .sort((a, b) => a.position - b.position)
    .map(
      (s): ClosingSection => ({
        id: s.id,
        title: s.title,
        questions: [...s.questions]
          .sort((a, b) => a.position - b.position)
          .map((tq) =>
            projectQuestion(tq.question, {
              label: tq.labelOverride,
              withNote: tq.withNote,
            }),
          ),
      }),
    );

  const order = new Map(
    template.sections.map((s) => [s.id, s.synthesisPosition ?? s.position]),
  );

  return {
    templateId: template.id,
    key: template.key,
    label: template.label,
    sections,
    synthesisSections: [...sections].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    ),
  };
}

/** Id of the synthetic section carrying answers to questions a grid dropped.
 *  Not a `Closing_TemplateSection` row: it exists per record, never in a
 *  composition, so it is keyed by a constant rather than by a cuid. */
export const RETIRED_SECTION_ID = 'retired';

/** The heading both renderers print retired answers under. Shared rather than
 *  written twice: the PDF got this right first, and a second spelling on screen
 *  would read as a different thing. */
export const RETIRED_SECTION_TITLE = 'Questions retirées de la grille';

/**
 * The synthesis sections to render for ONE record: the grid's own, plus a
 * "Questions retirées" section when the record answers questions the composition
 * no longer asks.
 *
 * This is the read side of the rule that makes `Closing_Answer` point at the
 * bank question rather than at the composition row: removing a question from a
 * grid must never be able to hide what was recorded. Without this, dropping a
 * question deletes it from 1400 synthèses and from every PDF at once, silently,
 * because both renderers iterate the composition and nothing else.
 *
 * A record's dependency on its own answers lives here, at the call site, rather
 * than on `ClosingGrid`: a grid stays a pure projection of its template, so two
 * records conducted with the same grid still share one.
 */
export function recordSynthesisSections(
  grid: ClosingGrid,
  retired: StoredClosingQuestion[],
): ClosingSection[] {
  if (retired.length === 0) return grid.synthesisSections;

  return [
    ...grid.synthesisSections,
    {
      id: RETIRED_SECTION_ID,
      title: RETIRED_SECTION_TITLE,
      // The bank's own wording, never a composition's: the grid that phrased it
      // for this format no longer asks it, so it has no wording to lend. And no
      // note field, for the same reason - a note is offered by a composition.
      // What was RECORDED against it still prints: a renderer reads the note off
      // the answer, never off the question (see `noteText` in `ClosingFlow`).
      questions: retired.map((q) =>
        projectQuestion(q, { label: null, withNote: false }),
      ),
    },
  ];
}

/** Every question of a grid, conduct order, flattened. */
export function gridQuestions(grid: ClosingGrid): ClosingQuestion[] {
  return grid.sections.flatMap((s) => s.questions);
}

/** The one question of a grid whose free text is quotable, if it has one. */
export function testimonialQuestion(grid: ClosingGrid): ClosingQuestion | null {
  return gridQuestions(grid).find((q) => q.testimonial) ?? null;
}

// ─── Bank keys the code itself names ───

/**
 * The handful of bank keys application code addresses by name, rather than
 * walking whatever the grid holds.
 *
 * Naming a key in code is a soft reference into data, so it is collected here and
 * asserted against the seeded bank by an integration test: a key that stops
 * existing has to fail a test rather than return "personne n'a répondu" to a
 * national director. Everything else about a grid is discovered, never named.
 */
export const CLOSING_QUESTION_KEYS = {
  /** Read back in the school-year review: how they heard about us. */
  discoveryChannel: 'discovery_channel',
  /** Read back in the school-year review: did it make them want more. */
  wantsMore: 'wants_more',
} as const;

// ─── The verdict (staff-only, not a bank question) ───

/**
 * The staff-only block filled after the closing, never asked of the student.
 *
 * Not a bank question, and this is the whole distinction: a grid describes what
 * is asked OF the student, while the verdict is the team's conclusion ABOUT them.
 * It is Jump-wide, closed, and the field the fiche, the admin archive and the
 * school-year review all group on, so it stays typed columns on the record.
 */
export const VERDICT_SECTION = {
  title: 'Avis de l’équipe',
  subtitle: 'À chaud, après le closing. Non visible par le talent.',
  /** The prompt above the recommendation picker. */
  promptLabel: 'Compatibilité du profil',
  noteLabel: 'Note rapide',
  notePlaceholder:
    'Le « pourquoi » de l’avis (ex. « très motivé mais hésite avec médecine », « à relancer pour la JPO »).',
  noteMaxLength: CLOSING_VERDICT_NOTE_LIMIT,
} as const;

export type RecommendationToneToken =
  | 'epi-tech'
  | 'epi-blue'
  | 'epi-tomorrow'
  | 'epi-drift';

/** Face glyph for the recommendation options, mapped to a Lucide icon in the
 *  verdict step (token kept out of this module, like the chip icons). The faces
 *  run laugh → frown across the row, since
 *  `CLOSING_RECOMMENDATION_DISPLAY_ORDER` leads with the most compatible
 *  profile. */
export type RecommendationIconToken = 'frown' | 'meh' | 'smile' | 'laugh';

export type RecommendationDescriptor = {
  label: string;
  short: string;
  tone: RecommendationToneToken;
  icon: RecommendationIconToken;
};

export const CLOSING_RECOMMENDATIONS: Record<
  ClosingRecommendation,
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

export const CLOSING_RECOMMENDATION_VALUES = Object.keys(
  CLOSING_RECOMMENDATIONS,
) as ClosingRecommendation[];

/** The recommendations ordered best → worst, so the verdict step leads with
 *  "100 % compatible" and ends on "Pas intéressé". Separate from
 *  `CLOSING_RECOMMENDATION_VALUES` (object-key order), which the cohort synthesis
 *  iterates and must stay stable. */
export const CLOSING_RECOMMENDATION_DISPLAY_ORDER: readonly ClosingRecommendation[] =
  ['tres_compatible', 'bon_profil', 'indecis', 'pas_interesse'];

export function isClosingRecommendation(v: string): v is ClosingRecommendation {
  return v in CLOSING_RECOMMENDATIONS;
}

/**
 * The verdicts that count as favourable, DERIVED from the display order rather
 * than listed.
 *
 * The order already carries the meaning - it runs "100 % compatible" to "Pas
 * intéressé" and the flow's faces run laugh to frown along it - so naming the
 * favourable two here would be a second decision about what good means, drifting
 * from the first the day a level is added. `optionPolarity` is the rule the
 * feedback scales already read, and on these four it yields exactly
 * `tres_compatible` and `bon_profil`.
 *
 * It exists because the figure was being computed downstream: handed the four
 * shares, a consumer adds the first two to say "63 % de profils compatibles ou à
 * suivre", which is the sentence a director actually speaks. Any proportion a
 * human asks for is a figure this platform returns.
 */
export const CLOSING_FAVOURABLE_RECOMMENDATIONS: readonly ClosingRecommendation[] =
  CLOSING_RECOMMENDATION_DISPLAY_ORDER.filter(
    (_, index) =>
      optionPolarity(index, CLOSING_RECOMMENDATION_DISPLAY_ORDER.length) ===
      'positive',
  );

// ─── List status (à faire / en cours / finalisé) ───

/** Display status for the list page. The DB only ever stores `in_progress` or
 *  `done`; the absence of a `Closing_Record` row is "à faire" (todo). */
export type ClosingListStatus = 'todo' | 'in_progress' | 'done';

export function closingListStatus(
  closing: { status: ClosingStatus } | null | undefined,
): ClosingListStatus {
  if (!closing) return 'todo';
  return closing.status;
}

export const CLOSING_STATUS_LABELS: Record<ClosingListStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Finalisé',
};

/** Chip classes mirror the inscrits page status badges so the two dev-space
 *  cohort tables share one color language: todo = neutral, in_progress = amber
 *  (action pending), done = epi-tech (gate cleared). */
export const CLOSING_STATUS_CHIP_CLASS: Record<ClosingListStatus, string> = {
  todo: 'border-border bg-muted text-muted-foreground',
  in_progress: 'border-warning/30 bg-warning/10 text-warning',
  done: 'border-epi-tech/30 bg-epi-tech/10 text-epi-tech-ink',
};
