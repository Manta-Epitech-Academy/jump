import type { FormSchema, Question, QuestionType, InputKind } from './schema';

/**
 * Client-side twin of the server's `toFormSchema` (`$lib/server/feedbackForms`).
 *
 * The builder edits a normalized graph (sections + questions + options); the
 * conversational renderer (`ChatScreen`) consumes the flat `FormSchema`. This
 * projects the in-memory editor graph to that shape so the live preview shows
 * exactly what a respondent sees, without a server round-trip. Keep it in lockstep
 * with the server projection.
 */

export type EditorOptionKind = 'choice' | 'extra' | 'skip';

export interface EditorOption {
  id: string;
  label: string;
  kind: EditorOptionKind;
  position: number;
}

export interface EditorQuestion {
  id: string;
  key: string;
  position: number;
  sectionId: string | null;
  prompt: string;
  type: QuestionType;
  required: boolean;
  identity: boolean;
  inputKind: InputKind | null;
  minSelections: number | null;
  maxSelections: number | null;
  skipsIdentity: boolean;
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
  slug: string;
  title: string;
  intro: string;
  sections: EditorSection[];
  questions: EditorQuestion[];
}

function projectQuestion(
  q: EditorQuestion,
  sectionById: Map<string, EditorSection>,
): Question {
  const section = q.sectionId ? sectionById.get(q.sectionId) : undefined;
  const choice = q.options
    .filter((o) => o.kind === 'choice')
    .map((o) => o.label);
  const extra = q.options.filter((o) => o.kind === 'extra').map((o) => o.label);
  const skip = q.options.find((o) => o.kind === 'skip');

  return {
    id: q.key,
    section: section?.title,
    sectionIntro: section?.intro ?? undefined,
    prompt: q.prompt,
    required: q.required,
    type: q.type,
    options: choice.length > 0 ? choice : undefined,
    extraOptions: extra.length > 0 ? extra : undefined,
    minSelections: q.minSelections ?? undefined,
    maxSelections: q.maxSelections ?? undefined,
    inputKind: q.inputKind ?? undefined,
    placeholder: q.placeholder ?? undefined,
    identity: q.identity || undefined,
    skipsIdentity: q.skipsIdentity || undefined,
    skipOption: skip?.label,
  };
}

export function projectEditorToSchema(graph: EditorGraph): FormSchema {
  const sectionById = new Map(graph.sections.map((s) => [s.id, s]));
  // Match the server projection (`FORM_GRAPH_INCLUDE` orders by `position`) so
  // the live preview can never drift from the respondent's question order, even
  // if the in-memory array is momentarily out of order mid-edit.
  const ordered = [...graph.questions].sort((a, b) => a.position - b.position);
  return {
    id: graph.slug,
    title: graph.title,
    intro: graph.intro,
    questions: ordered.map((q) => projectQuestion(q, sectionById)),
  };
}
