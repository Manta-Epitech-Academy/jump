import type {
  FormSchema,
  Question,
  QuestionType,
  InputKind,
  IdentityField,
} from './schema';
import { IDENTITY_FIELD_TO_INPUT_KIND } from './schema';

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
  slug: string;
  title: string;
  intro: string;
  outro: string | null;
  personaName: string | null;
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

  // An identity question derives its validation kind from the field and is always
  // required; a content question keeps what the author set.
  const inputKind = q.identityField
    ? (IDENTITY_FIELD_TO_INPUT_KIND[q.identityField] ?? undefined)
    : (q.inputKind ?? undefined);

  const optionReactions: Record<string, string> = {};
  for (const o of q.options) {
    if (o.reaction) optionReactions[o.label] = o.reaction;
  }

  return {
    id: q.key,
    section: section?.title,
    sectionIntro: section?.intro ?? undefined,
    prompt: q.prompt,
    required: q.identityField ? true : q.required,
    type: q.type,
    options: choice.length > 0 ? choice : undefined,
    extraOptions: extra.length > 0 ? extra : undefined,
    minSelections: q.minSelections ?? undefined,
    maxSelections: q.maxSelections ?? undefined,
    inputKind,
    placeholder: q.placeholder ?? undefined,
    identityField: q.identityField ?? undefined,
    optionReactions:
      Object.keys(optionReactions).length > 0 ? optionReactions : undefined,
  };
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
    intro: graph.intro,
    outro: graph.outro ?? undefined,
    personaName: graph.personaName ?? undefined,
    questions: ordered.map((q) => projectQuestion(q, sectionById)),
  };
}
