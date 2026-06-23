/**
 * Seed the DB-backed feedback forms ("Bilan du stage") from the original JSON
 * fixtures (stage / w1 / w2). The forms now live in the database so staff can
 * create / duplicate / edit them at runtime; these fixtures are the initial
 * content.
 *
 * Create-only and idempotent: a form is inserted only when its slug does not
 * already exist, so a re-run never clobbers edits staff made in the builder
 * (same contract as scripts/seed-catalogs.ts). Safe to run as an additive
 * top-up. To re-seed a form from scratch, delete it in the builder first.
 *
 * Run: bun run seed:feedback-forms
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import {
  PrismaClient,
  type Feedback_OptionKind,
  type Feedback_QuestionType,
  type Feedback_InputKind,
  type Feedback_IdentityField,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import stage from './feedbackForms/stage.json' with { type: 'json' };
import w1 from './feedbackForms/w1.json' with { type: 'json' };
import w2 from './feedbackForms/w2.json' with { type: 'json' };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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

async function seedForm(spec: FormSpec): Promise<void> {
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

async function main() {
  for (const spec of SPECS) {
    await seedForm(spec);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
