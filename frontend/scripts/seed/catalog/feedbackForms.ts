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
  type Feedback_OptionKind,
  type Feedback_QuestionType,
  type Feedback_InputKind,
  type Feedback_IdentityField,
} from '@prisma/client';

import stage from './feedbackForms/stage.json' with { type: 'json' };
import w1 from './feedbackForms/w1.json' with { type: 'json' };
import w2 from './feedbackForms/w2.json' with { type: 'json' };

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
  allowsPublicAccess: boolean;
  personaName: string | null;
}

const SPECS: FormSpec[] = [
  {
    json: stage as JsonForm,
    dashboardNudge: true,
    allowsPublicAccess: true,
    personaName: 'Bernard le canard',
  },
  {
    json: w1 as JsonForm,
    dashboardNudge: false,
    allowsPublicAccess: false,
    personaName: null,
  },
  {
    json: w2 as JsonForm,
    dashboardNudge: false,
    allowsPublicAccess: false,
    personaName: null,
  },
];

const optionLabel = (o: JsonOption): string =>
  typeof o === 'string' ? o : o.label;
const optionReaction = (o: JsonOption): string | null =>
  typeof o === 'string' ? null : (o.reaction ?? null);

/** Builds the (label, kind, position, reaction) option rows for one question. */
function buildOptions(q: JsonQuestion): {
  label: string;
  kind: Feedback_OptionKind;
  position: number;
  reaction: string | null;
}[] {
  const rows: {
    label: string;
    kind: Feedback_OptionKind;
    position: number;
    reaction: string | null;
  }[] = [];
  let pos = 0;
  for (const o of q.options ?? []) {
    rows.push({
      label: optionLabel(o),
      kind: 'choice',
      position: pos++,
      reaction: optionReaction(o),
    });
  }
  for (const label of q.extraOptions ?? []) {
    rows.push({ label, kind: 'extra', position: pos++, reaction: null });
  }
  return rows;
}

async function seedForm(prisma: PrismaClient, spec: FormSpec): Promise<void> {
  const { json } = spec;
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
        slug: json.id,
        title: json.title,
        intro: json.intro,
        outro: json.outro ?? null,
        personaName: spec.personaName,
        status: 'published',
        allowsAuthenticatedAccess: true,
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
          formId: form.id,
          sectionId: currentSectionId,
          key: q.id,
          position: position++,
          prompt: q.prompt,
          type: q.type,
          required: q.required,
          identityField: q.identityField ?? null,
          inputKind: q.inputKind ?? null,
          minSelections: q.minSelections ?? null,
          maxSelections: q.maxSelections ?? null,
          placeholder: q.placeholder ?? null,
          options: { create: buildOptions(q) },
        },
      });
    }

    console.log(
      `✓ seeded "${json.id}" (${json.questions.length} questions, ${sectionId.size} sections)`,
    );
  });
}

/** Returns how many forms were inserted; 0 means everything was already there. */
export async function seedFeedbackForms(prisma: PrismaClient): Promise<number> {
  let created = 0;
  for (const spec of SPECS) {
    const before = await prisma.feedback_Form.count({ where: { slug: spec.json.id } });
    await seedForm(prisma, spec);
    const after = await prisma.feedback_Form.count({ where: { slug: spec.json.id } });
    if (after > before) created += 1;
  }
  return created;
}

/** The slugs the catalogue owns, so a scenario can point an event at one. */
export const FEEDBACK_FORM_SLUGS = SPECS.map((spec) => spec.json.id);
