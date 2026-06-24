import type {
  FormSchema,
  Question,
  QuestionType,
  InputKind,
  IdentityField,
} from './schema';
import { projectQuestionToSchema, buildPersonaIconUrl } from './schema';

/**
 * Client-side twin of the server's `toFormSchema` (`$lib/server/feedbackForms`).
 *
 * The builder edits a normalized graph (sections + questions + options); the
 * conversational renderer (`ChatScreen`) consumes the flat `FormSchema`. This
 * projects the in-memory editor graph to that shape so the live preview shows
 * exactly what a respondent sees, without a server round-trip. Keep it in lockstep
 * with the server projection.
 */

export type EditorOptionKind = 'choice' | 'extra';

export interface EditorOption {
  id: string;
  label: string;
  kind: EditorOptionKind;
  position: number;
  reaction: string | null;
}

export interface EditorQuestion {
  id: string;
  key: string;
  position: number;
  sectionId: string | null;
  prompt: string;
  type: QuestionType;
  required: boolean;
  identityField: IdentityField | null;
  inputKind: InputKind | null;
  minSelections: number | null;
  maxSelections: number | null;
  placeholder: string | null;
  options: EditorOption[];
}

export interface EditorSection {
  id: string;
  title: string;
  intro: string | null;
  position: number;
}

export interface EditorGraph {
  formId: string;
  slug: string;
  title: string;
  intro: string | null;
  outro: string | null;
  personaName: string | null;
  personaIconKey: string | null;
  sections: EditorSection[];
  questions: EditorQuestion[];
}

function projectQuestion(
  q: EditorQuestion,
  sectionById: Map<string, EditorSection>,
): Question {
  const section = q.sectionId ? sectionById.get(q.sectionId) : undefined;
  return projectQuestionToSchema(
    q,
    section ? { title: section.title, intro: section.intro } : undefined,
  );
}

/** Which respondent the preview projects. Mirrors the server's `FormAudience`. */
export type PreviewAudience = 'public' | 'authenticated';

export function projectEditorToSchema(
  graph: EditorGraph,
  audience: PreviewAudience = 'public',
): FormSchema {
  const sectionById = new Map(graph.sections.map((s) => [s.id, s]));
  // Match the server projection (`FORM_GRAPH_INCLUDE` orders by `position`) so
  // the live preview can never drift from the respondent's question order, even
  // if the in-memory array is momentarily out of order mid-edit. Identity
  // questions are dropped for connected talents, exactly like `toFormSchema`.
  const ordered = [...graph.questions]
    .filter((q) => audience === 'public' || q.identityField == null)
    .sort((a, b) => a.position - b.position);
  return {
    id: graph.slug,
    title: graph.title,
    intro: graph.intro ?? undefined,
    outro: graph.outro ?? undefined,
    personaName: graph.personaName ?? undefined,
    personaIconUrl: buildPersonaIconUrl(graph.formId, graph.personaIconKey),
    questions: ordered.map((q) => projectQuestion(q, sectionById)),
  };
}
