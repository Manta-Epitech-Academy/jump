// A feedback form read back whole, in exactly the shape the admin API's
// whole-form write accepts: what an author edits from rather than rewriting,
// and what the write compares against to decide whether an edit is structural.
// One reader for both, so the two can never describe a form differently.
import type { Prisma } from '@prisma/client';
import type {
  AuthoredForm,
  AuthoredQuestion,
} from '$lib/domain/feedbackForms/authoring';
import type {
  IdentityField,
  InputKind,
  QuestionType,
} from '$lib/domain/feedbackForms/schema';

const QUESTION_SELECT = {
  sectionId: true,
  key: true,
  prompt: true,
  type: true,
  required: true,
  identityField: true,
  inputKind: true,
  minSelections: true,
  maxSelections: true,
  placeholder: true,
  options: {
    orderBy: { position: 'asc' },
    select: { id: true, label: true, kind: true, reaction: true },
  },
} as const satisfies Prisma.Feedback_QuestionSelect;

const CONTENT_SELECT = {
  id: true,
  slug: true,
  title: true,
  intro: true,
  outro: true,
  personaName: true,
  personaIconKey: true,
  personaIconSourceUrl: true,
  status: true,
  allowsAuthenticatedAccess: true,
  allowsPublicAccess: true,
  dashboardNudge: true,
  sections: {
    orderBy: { position: 'asc' },
    select: { id: true, title: true, intro: true },
  },
  questions: { orderBy: { position: 'asc' }, select: QUESTION_SELECT },
  _count: { select: { submissions: true, events: true } },
} as const satisfies Prisma.Feedback_FormSelect;

type QuestionRow = Prisma.Feedback_QuestionGetPayload<{
  select: typeof QUESTION_SELECT;
}>;

/**
 * A whole form, plus what an author needs to know before editing it: whether
 * it is locked (it has responses, so its structure is frozen), how many
 * responses and how many events use it.
 *
 * `personaIcon` is null for the default mascot. Its `sourceUrl` is the address
 * it was copied from, or null when it was uploaded in the builder: such an icon
 * has no address to restate, which is why the write leaves the icon alone when
 * it is not mentioned.
 */
export type FeedbackFormContent = AuthoredForm & {
  formId: string;
  slug: string;
  personaIcon: { sourceUrl: string | null } | null;
  locked: boolean;
  submissions: number;
  attachedEvents: number;
};

function authoredQuestion(q: QuestionRow): AuthoredQuestion {
  return {
    key: q.key,
    prompt: q.prompt,
    type: q.type as QuestionType,
    required: q.required,
    identityField: q.identityField as IdentityField | null,
    inputKind: q.inputKind as InputKind | null,
    minSelections: q.minSelections,
    maxSelections: q.maxSelections,
    placeholder: q.placeholder,
    options: q.options.map((o) => ({
      optionId: o.id,
      label: o.label,
      kind: o.kind,
      reaction: o.reaction,
    })),
  };
}

/**
 * Read one form whole, or null when there is none. Takes the client to read
 * through so the write can read it again under its lock, inside its transaction.
 *
 * Questions are grouped by the section they belong to and ordered by position
 * within it, which is the order a respondent meets them in. Positions are not
 * returned: the order of the arrays is the position, and the write recomputes
 * them from it.
 */
export async function readFeedbackFormContent(
  db: Prisma.TransactionClient,
  formId: string,
): Promise<FeedbackFormContent | null> {
  const form = await db.feedback_Form.findUnique({
    where: { id: formId },
    select: CONTENT_SELECT,
  });
  if (!form) return null;

  return {
    formId: form.id,
    slug: form.slug,
    title: form.title,
    intro: form.intro,
    outro: form.outro,
    personaName: form.personaName,
    personaIcon: form.personaIconKey
      ? { sourceUrl: form.personaIconSourceUrl }
      : null,
    status: form.status,
    allowsAuthenticatedAccess: form.allowsAuthenticatedAccess,
    allowsPublicAccess: form.allowsPublicAccess,
    dashboardNudge: form.dashboardNudge,
    questions: form.questions
      .filter((q) => q.sectionId === null)
      .map(authoredQuestion),
    sections: form.sections.map((s) => ({
      sectionId: s.id,
      title: s.title,
      intro: s.intro,
      questions: form.questions
        .filter((q) => q.sectionId === s.id)
        .map(authoredQuestion),
    })),
    locked: form._count.submissions > 0,
    submissions: form._count.submissions,
    attachedEvents: form._count.events,
  };
}

/** The authored part of a form, without what is reported about it. */
export function authoredFormOf(content: FeedbackFormContent): AuthoredForm {
  return {
    title: content.title,
    intro: content.intro,
    outro: content.outro,
    personaName: content.personaName,
    status: content.status,
    allowsAuthenticatedAccess: content.allowsAuthenticatedAccess,
    allowsPublicAccess: content.allowsPublicAccess,
    dashboardNudge: content.dashboardNudge,
    questions: content.questions,
    sections: content.sections,
  };
}
