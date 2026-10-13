/**
 * The feedback forms, from the JSON fixtures that were their original home.
 *
 * A form is a referential the same way the interest catalogue is: staff author
 * and edit these at runtime in the builder, so the fixtures are an initial
 * content, never an authority. Create-only and idempotent, keyed on the slug: a
 * re-run inserts what is missing and never touches a form somebody has since
 * edited. To rebuild one from scratch, delete it in the builder first.
 *
 * Only one of the four forms in production has ever collected an answer. The
 * `bilan` scenario submits against that one, and leaves the others empty on
 * purpose - an unanswered form is the ordinary case and its empty states are
 * what break.
 */

import {
  type PrismaClient,
  type Feedback_FormStatus,
  type Feedback_OptionKind,
  type Feedback_QuestionType,
  type Feedback_InputKind,
  type Feedback_IdentityField,
} from '@prisma/client';

import { IDENTITY_FIELD_TO_INPUT_KIND } from '../../../src/lib/domain/feedbackForms/schema';

import stage from './feedbackForms/stage.json' with { type: 'json' };
import w1 from './feedbackForms/w1.json' with { type: 'json' };
import w2 from './feedbackForms/w2.json' with { type: 'json' };
import { id } from '../ids';

// An option is either a bare label or a label carrying the bot's reaction to it.
type JsonOption = string | { label: string; reaction?: string };

interface JsonQuestion {
  id: string;
  section?: string;
  sectionIntro?: string;
  prompt: string;
  required: boolean;
  type: Feedback_QuestionType;
  options?: JsonOption[];
  extraOptions?: string[];
  minSelections?: number;
  maxSelections?: number;
  inputKind?: Feedback_InputKind;
  placeholder?: string;
  identityField?: Feedback_IdentityField;
}

interface JsonForm {
  id: string;
  title: string;
  intro: string;
  outro?: string;
  questions: JsonQuestion[];
}

interface FormSpec {
  json: JsonForm;
  dashboardNudge: boolean;
  /**
   * Who may answer. The two are independent in the builder, and the pair is
   * what decides the form's audience: both is the ordinary case, public only is
   * a form whose respondents have no account (an attestation for a school), and
   * a nudge on the dashboard is only valid where connected talents may answer.
   */
  allowsAuthenticatedAccess: boolean;
  allowsPublicAccess: boolean;
  /** A form being authored has no introduction yet, and a draft says so. */
  omitIntro?: boolean;
  personaName: string | null;
  /**
   * The persona's icon, as a key with no bytes behind it, like every stored
   * file the generator writes: `PersonaAvatar` shows the default mascot when
   * the object cannot be fetched, which is the state this puts on screen.
   * `sourceUrl` is where the builder says it was copied from, on a `.invalid`
   * host so a validation environment never points anybody at a live address.
   */
  personaIcon?: { sourceUrl: string };
  /**
   * A form is not always published. The builder produces drafts and archives
   * old forms, and both states change what the talent-facing side may show, so
   * the seeded set carries one of each rather than three published forms.
   */
  status: Feedback_FormStatus;
  extraAuthoredQuestion?: JsonQuestion;
}

const SPECS: FormSpec[] = [
  {
    json: stage as JsonForm,
    dashboardNudge: true,
    allowsAuthenticatedAccess: true,
    allowsPublicAccess: true,
    personaName: 'Bernard le canard',
    personaIcon: { sourceUrl: 'https://seed.invalid/mascottes/bernard.png' },
    status: 'published',
  },
  {
    json: w1 as JsonForm,
    dashboardNudge: false,
    allowsAuthenticatedAccess: true,
    allowsPublicAccess: false,
    omitIntro: true,
    personaName: null,
    status: 'draft',
    // A short-answer question with an explicit input kind. The three fixtures
    // are transcriptions of forms authored before `inputKind` existed, so none
    // of them carries one on a content question - only the builder produces
    // that, and it is the only way `Feedback_InputKind.text` is reachable. It
    // is attached to the draft because a draft is a form being authored.
    extraAuthoredQuestion: {
      id: 'prenom_usage',
      prompt: 'Sous quel prénom préfères-tu qu’on t’appelle ?',
      required: false,
      type: 'text',
      inputKind: 'text',
      placeholder: 'Ton prénom d’usage',
    },
  },
  {
    // The attestation form: the school asks for it, so its respondents are the
    // public and it asks them who they are. It is archived, and an archived form
    // keeps the answers it collected.
    json: w2 as JsonForm,
    dashboardNudge: false,
    allowsAuthenticatedAccess: false,
    allowsPublicAccess: true,
    personaName: null,
    status: 'archived',
  },
];

const optionLabel = (o: JsonOption): string =>
  typeof o === 'string' ? o : o.label;
const optionReaction = (o: JsonOption): string | null =>
  typeof o === 'string' ? null : (o.reaction ?? null);

/** Builds the (label, kind, position, reaction) option rows for one question. */
type OptionRow = {
  id: string;
  label: string;
  kind: Feedback_OptionKind;
  position: number;
  reaction: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function buildOptions(
  formSlug: string,
  q: JsonQuestion,
  anchor: Date,
): OptionRow[] {
  const rows: OptionRow[] = [];
  let pos = 0;
  const push = (
    label: string,
    kind: Feedback_OptionKind,
    reaction: string | null,
  ): void => {
    rows.push({
      id: id('ffo', formSlug, q.id, pos),
      label,
      kind,
      position: pos++,
      reaction,
      createdAt: anchor,
      updatedAt: anchor,
    });
  };
  for (const o of q.options ?? [])
    push(optionLabel(o), 'choice', optionReaction(o));
  for (const label of q.extraOptions ?? []) push(label, 'extra', null);
  return rows;
}

async function seedForm(
  prisma: PrismaClient,
  spec: FormSpec,
  anchor: Date,
): Promise<void> {
  const json: JsonForm = spec.extraAuthoredQuestion
    ? {
        ...spec.json,
        questions: [...spec.json.questions, spec.extraAuthoredQuestion],
      }
    : spec.json;
  const existing = await prisma.feedback_Form.findUnique({
    where: { slug: json.id },
    select: { id: true },
  });
  if (existing) {
    console.log(`• skip "${json.id}" (already exists)`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const form = await tx.feedback_Form.create({
      data: {
        id: id('ffm', json.id),
        createdAt: anchor,
        updatedAt: anchor,
        slug: json.id,
        title: json.title,
        intro: spec.omitIntro ? null : json.intro,
        outro: json.outro ?? null,
        personaName: spec.personaName,
        personaIconKey: spec.personaIcon
          ? `feedback-personas/${id('ffm', json.id)}/seed.webp`
          : null,
        personaIconSourceUrl: spec.personaIcon?.sourceUrl ?? null,
        status: spec.status,
        allowsAuthenticatedAccess: spec.allowsAuthenticatedAccess,
        allowsPublicAccess: spec.allowsPublicAccess,
        dashboardNudge: spec.dashboardNudge,
      },
      select: { id: true },
    });

    // Sections, in first-appearance order; intro taken from the first question
    // of the section that carries one.
    const sectionId = new Map<string, string>();
    for (const q of json.questions) {
      if (!q.section || sectionId.has(q.section)) continue;
      const created = await tx.feedback_Section.create({
        data: {
          id: id('ffs', json.id, sectionId.size),
          formId: form.id,
          position: sectionId.size,
          title: q.section,
          intro: q.sectionIntro ?? null,
        },
        select: { id: true },
      });
      sectionId.set(q.section, created.id);
    }

    // In the JSON, `section` marks only the FIRST question of a section; the
    // rest belong to it implicitly (the chat shows the header once, at the
    // transition). Make membership explicit by carrying the current section
    // forward, so every question is linked to its section (the builder groups
    // correctly and the projected per-question `section` reproduces the same
    // header behaviour).
    let position = 0;
    let currentSectionId: string | null = null;
    for (const q of json.questions) {
      if (q.section) currentSectionId = sectionId.get(q.section) ?? null;
      await tx.feedback_Question.create({
        data: {
          id: id('ffq', json.id, q.id),
          createdAt: anchor,
          updatedAt: anchor,
          formId: form.id,
          sectionId: currentSectionId,
          key: q.id,
          position: position++,
          prompt: q.prompt,
          type: q.type,
          required: q.required,
          identityField: q.identityField ?? null,
          // An identity question derives its validation kind from the field,
          // exactly as `domain/feedbackForms/schema.ts` does when the builder
          // projects a form. The fixtures predate `inputKind` and carry none,
          // so without this a seeded email field would validate as free text
          // and the enum would have no rows at all.
          inputKind: q.identityField
            ? (IDENTITY_FIELD_TO_INPUT_KIND[q.identityField] ?? null)
            : (q.inputKind ?? null),
          minSelections: q.minSelections ?? null,
          maxSelections: q.maxSelections ?? null,
          placeholder: q.placeholder ?? null,
          options: { create: buildOptions(json.id, q, anchor) },
        },
      });
    }

    console.log(
      `✓ seeded "${json.id}" (${json.questions.length} questions, ${sectionId.size} sections)`,
    );
  });
}

/** Returns how many forms were inserted; 0 means everything was already there. */
export async function seedFeedbackForms(
  prisma: PrismaClient,
  anchor: Date,
): Promise<number> {
  let created = 0;
  for (const spec of SPECS) {
    const before = await prisma.feedback_Form.count({
      where: { slug: spec.json.id },
    });
    await seedForm(prisma, spec, anchor);
    const after = await prisma.feedback_Form.count({
      where: { slug: spec.json.id },
    });
    if (after > before) created += 1;
  }
  return created;
}

/** The slugs the catalogue owns, so the wipe can find them. */
export const FEEDBACK_FORM_SLUGS = SPECS.map((spec) => spec.json.id);

/** The form events are bound to, and the one talents and the public answer. */
export const STAGE_FORM_SLUG = stage.id;

/**
 * The form only the public may answer, and so the one that holds public
 * submissions: a form that refuses the public cannot have collected any.
 */
export const PUBLIC_ONLY_FORM_SLUG = w2.id;
