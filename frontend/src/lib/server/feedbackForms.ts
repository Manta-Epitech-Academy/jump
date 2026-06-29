import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import type {
  FormSchema,
  Question,
  QuestionType,
  InputKind,
  IdentityField,
} from '$lib/domain/feedbackForms/schema';
import {
  projectQuestionToSchema,
  buildPersonaIconUrl,
} from '$lib/domain/feedbackForms/schema';

/** Who a projected form is rendered for; mirrors Feedback_SubmissionSource. */
export type FormAudience = 'public' | 'authenticated';

/**
 * Server-side data layer for the DB-backed feedback forms ("Bilan du stage").
 *
 * The chat UI is driven by the flat `FormSchema` shape (questions carry their own
 * `section`/`sectionIntro`/`options`). The DB stores that normalized
 * (Form -> Section -> Question -> Option). `toFormSchema` projects the graph back
 * to the UI shape so the conversation controller and components never change; only
 * the source moved from JSON to the database.
 */

export const FORM_GRAPH_INCLUDE = {
  sections: { orderBy: { position: 'asc' } },
  questions: {
    orderBy: { position: 'asc' },
    include: {
      section: true,
      options: { orderBy: { position: 'asc' } },
    },
  },
} satisfies Prisma.Feedback_FormInclude;

export type FeedbackFormGraph = Prisma.Feedback_FormGetPayload<{
  include: typeof FORM_GRAPH_INCLUDE;
}>;

type GraphQuestion = FeedbackFormGraph['questions'][number];

export function getFormGraphBySlug(
  slug: string,
): Promise<FeedbackFormGraph | null> {
  return prisma.feedback_Form.findUnique({
    where: { slug },
    include: FORM_GRAPH_INCLUDE,
  });
}

export function getFormGraphById(
  id: string,
): Promise<FeedbackFormGraph | null> {
  return prisma.feedback_Form.findUnique({
    where: { id },
    include: FORM_GRAPH_INCLUDE,
  });
}

function projectQuestion(q: GraphQuestion): Question {
  // Stored once per section; the controller only emits the intro at the section
  // transition, so carrying it on every question in the section is harmless.
  return projectQuestionToSchema(
    {
      key: q.key,
      prompt: q.prompt,
      type: q.type as QuestionType,
      required: q.required,
      identityField: (q.identityField ?? null) as IdentityField | null,
      inputKind: (q.inputKind ?? null) as InputKind | null,
      minSelections: q.minSelections,
      maxSelections: q.maxSelections,
      placeholder: q.placeholder,
      options: q.options.map((o) => ({
        label: o.label,
        kind: o.kind as 'choice' | 'extra',
        reaction: o.reaction,
      })),
    },
    q.section ? { title: q.section.title, intro: q.section.intro } : undefined,
  );
}

/**
 * Projects a DB form graph into the flat `FormSchema` the chat UI consumes.
 * Identity questions are dropped for authenticated talents (Jump already holds
 * their identity); public respondents are asked them.
 */
export function toFormSchema(
  graph: FeedbackFormGraph,
  audience: FormAudience,
): FormSchema {
  const questions = graph.questions
    .filter((q) => audience === 'public' || q.identityField == null)
    .map(projectQuestion);
  return {
    id: graph.slug,
    title: graph.title,
    intro: graph.intro ?? undefined,
    outro: graph.outro ?? undefined,
    personaName: graph.personaName ?? undefined,
    personaIconUrl: buildPersonaIconUrl(graph.id, graph.personaIconKey),
    questions,
  };
}

/** Number of submissions a form has (drives the structural-edit lock). */
export function countSubmissions(formId: string): Promise<number> {
  return prisma.feedback_Submission.count({ where: { formId } });
}

/**
 * Throws 423 (Locked) if the form already has responses. Structural edits (add /
 * delete / reorder questions / options / sections) would shift the meaning of
 * existing answers, so once responses exist the admin must duplicate the form to
 * restructure. Text-only edits (prompt / label / intro) stay allowed and don't
 * call this. The status is deliberately distinct from the 409 (Conflict) that
 * uniqueness checks throw: the client flips read-only on 423 only, so a benign
 * "label already exists" clash never locks the whole builder.
 */
export async function assertEditable(formId: string): Promise<void> {
  const n = await countSubmissions(formId);
  if (n > 0) {
    throw error(
      423,
      'Ce formulaire a déjà des réponses : dupliquez-le pour en modifier la structure.',
    );
  }
}
