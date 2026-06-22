import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import type {
  FormSchema,
  Question,
  QuestionType,
  InputKind,
} from '$lib/domain/feedbackForms/schema';

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
  const choice = q.options
    .filter((o) => o.kind === 'choice')
    .map((o) => o.label);
  const extra = q.options.filter((o) => o.kind === 'extra').map((o) => o.label);
  const skip = q.options.find((o) => o.kind === 'skip');

  return {
    id: q.key,
    section: q.section?.title,
    // Stored once per section; the controller only emits it at the section
    // transition, so carrying it on every question in the section is harmless.
    sectionIntro: q.section?.intro ?? undefined,
    prompt: q.prompt,
    required: q.required,
    type: q.type as QuestionType,
    options: choice.length > 0 ? choice : undefined,
    extraOptions: extra.length > 0 ? extra : undefined,
    minSelections: q.minSelections ?? undefined,
    maxSelections: q.maxSelections ?? undefined,
    inputKind: (q.inputKind ?? undefined) as InputKind | undefined,
    placeholder: q.placeholder ?? undefined,
    identity: q.identity || undefined,
    skipsIdentity: q.skipsIdentity || undefined,
    skipOption: skip?.label,
  };
}

/** Projects a DB form graph into the flat `FormSchema` the chat UI consumes. */
export function toFormSchema(graph: FeedbackFormGraph): FormSchema {
  return {
    id: graph.slug,
    title: graph.title,
    intro: graph.intro,
    questions: graph.questions.map(projectQuestion),
  };
}

/** Number of submissions a form has (drives the structural-edit lock). */
export function countSubmissions(formId: string): Promise<number> {
  return prisma.feedback_Submission.count({ where: { formId } });
}

/**
 * Throws 409 if the form already has responses. Structural edits (add / delete /
 * reorder questions / options / sections) would shift the meaning of existing
 * answers, so once responses exist the admin must duplicate the form to restructure.
 * Text-only edits (prompt / label / intro) stay allowed and don't call this.
 */
export async function assertEditable(formId: string): Promise<void> {
  const n = await countSubmissions(formId);
  if (n > 0) {
    throw error(
      409,
      'Ce formulaire a déjà des réponses : dupliquez-le pour en modifier la structure.',
    );
  }
}
