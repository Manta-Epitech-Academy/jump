// What a whole feedback form is, as the declarative write states it and the
// detail read returns it, and the rules that hold over a form as a whole. Pure,
// so the admin API write, the builder's endpoints and the builder's own warnings
// read one set of rules rather than three.
//
// The split this file draws is the one the builder already enforced edit by
// edit: once a form has responses, what a question MEANS is frozen and what it
// READS is not. The write states the whole form at once, so the same line is
// drawn here by comparing two whole forms instead of by inspecting one patch.
import {
  IDENTITY_FIELD_TO_QUESTION_TYPE,
  type IdentityField,
  type InputKind,
  type QuestionType,
} from './schema';
import type { FormStatusValue } from './status';

export type OptionKind = 'choice' | 'extra';

/**
 * One answer option. An option has no stable key, only its row id, and that id
 * is what a recorded answer references: renaming an option keeps its id, so the
 * answers already given to it stay attached. Null for an option to create.
 */
export type AuthoredOption = {
  optionId: string | null;
  label: string;
  kind: OptionKind;
  reaction: string | null;
};

export type AuthoredQuestion = {
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  identityField: IdentityField | null;
  inputKind: InputKind | null;
  minSelections: number | null;
  maxSelections: number | null;
  placeholder: string | null;
  options: AuthoredOption[];
};

/** A section, identified by its row id like an option. Null to create one. */
export type AuthoredSection = {
  sectionId: string | null;
  title: string;
  intro: string | null;
  questions: AuthoredQuestion[];
};

/**
 * A whole form. Array order IS position: the questions outside any section come
 * first, then each section's, which is the order the builder lays them out in
 * and the order a respondent is asked them.
 */
export type AuthoredForm = {
  title: string;
  intro: string | null;
  outro: string | null;
  personaName: string | null;
  status: FormStatusValue;
  allowsAuthenticatedAccess: boolean;
  allowsPublicAccess: boolean;
  dashboardNudge: boolean;
  questions: AuthoredQuestion[];
  sections: AuthoredSection[];
};

/**
 * Why a structural edit is refused once a form has responses. Said once, so the
 * builder's lock and the API's refusal give the same way out.
 */
export const STRUCTURE_LOCKED_MESSAGE =
  'Ce formulaire a déjà des réponses : dupliquez-le pour en modifier la structure.';

/**
 * The question fields that change what an answer means. Editing one once a form
 * has responses would make the answers already recorded say something else, so
 * they are frozen then; `prompt` and `placeholder` are wording, never frozen.
 * Where a question sits (its section, its position) is structural too, and is
 * compared on the placement rather than listed here.
 */
export const STRUCTURAL_QUESTION_FIELDS = [
  'key',
  'type',
  'required',
  'identityField',
  'inputKind',
  'minSelections',
  'maxSelections',
] as const satisfies readonly (keyof AuthoredQuestion)[];

/** Every question of a form, in the order a respondent meets them. */
export function allQuestions(form: {
  questions: AuthoredQuestion[];
  sections: { questions: AuthoredQuestion[] }[];
}): AuthoredQuestion[] {
  return [...form.questions, ...form.sections.flatMap((s) => s.questions)];
}

/**
 * Public access is on, but no question collects the e-mail the public submit
 * endpoint requires, so every public response would be refused
 * (`feedbackSubmissions` answers 400 without `respondentEmail`).
 */
export function publicMissingEmail(form: {
  allowsPublicAccess: boolean;
  questions: { identityField: IdentityField | null }[];
}): boolean {
  return (
    form.allowsPublicAccess &&
    !form.questions.some((q) => q.identityField === 'email')
  );
}

const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set([
  'single',
  'multiple',
  'scale',
]);

/**
 * What would make a form broken for the people answering it, one French
 * sentence per problem, naming the question at fault. Empty when the form is
 * sound. The per-question field rules (an input kind only on a text question,
 * selection bounds only on a multiple choice) live on the question schema in
 * `validation/feedbackForms.ts`; these are the rules that need the whole form,
 * or a question together with its options.
 */
export function formIntegrityProblems(form: AuthoredForm): string[] {
  const problems: string[] = [];
  const questions = allQuestions(form);

  const keys = new Set<string>();
  const identities = new Set<IdentityField>();
  for (const q of questions) {
    if (keys.has(q.key)) {
      problems.push(`La clé « ${q.key} » est utilisée par deux questions.`);
    }
    keys.add(q.key);

    if (q.identityField) {
      if (identities.has(q.identityField)) {
        problems.push(
          `Deux questions collectent la même donnée d'identité (${q.identityField}) : chaque répondant n'en a qu'une, la seconde écraserait la première.`,
        );
      }
      identities.add(q.identityField);
      const expected = IDENTITY_FIELD_TO_QUESTION_TYPE[q.identityField];
      if (q.type !== expected) {
        problems.push(
          `« ${q.key} » collecte ${q.identityField} et doit donc être de type ${expected}, pas ${q.type}.`,
        );
      }
    }

    const choices = q.options.filter((o) => o.kind === 'choice');
    if (CHOICE_TYPES.has(q.type) && choices.length === 0) {
      problems.push(
        `« ${q.key} » est une question à choix sans aucune option : personne ne pourrait y répondre.`,
      );
    }
    if (!CHOICE_TYPES.has(q.type) && q.options.length > 0) {
      problems.push(
        `« ${q.key} » est une question à réponse libre (${q.type}) : elle ne prend pas d'options.`,
      );
    }
    if (q.type !== 'scale' && q.options.some((o) => o.kind === 'extra')) {
      problems.push(
        `« ${q.key} » : une option hors échelle (« extra ») n'existe que sur une question de type scale.`,
      );
    }
    if (q.minSelections !== null && q.minSelections > choices.length) {
      problems.push(
        `« ${q.key} » demande au moins ${q.minSelections} choix parmi ${choices.length} option(s) : personne ne pourrait y répondre.`,
      );
    }

    // A submission resolves an answer by its label, so two options reading the
    // same would make one of them unreachable.
    const labels = new Set<string>();
    for (const o of q.options) {
      if (labels.has(o.label)) {
        problems.push(
          `« ${q.key} » propose deux fois l'option « ${o.label} ».`,
        );
      }
      labels.add(o.label);
    }
  }

  // The answering route refuses a talent when authenticated access is off, so a
  // nudge would point the dashboard at a form that turns them away. The builder
  // switches it off for you; a whole-form write says what it wants instead.
  if (form.dashboardNudge && !form.allowsAuthenticatedAccess) {
    problems.push(
      'La relance sur le tableau de bord (dashboardNudge) ne vaut que pour un formulaire ouvert aux talents connectés (allowsAuthenticatedAccess) : elle les enverrait sur un formulaire qui les refuse.',
    );
  }

  if (
    form.status === 'published' &&
    publicMissingEmail({ ...form, questions })
  ) {
    problems.push(
      "Un formulaire publié et ouvert au public doit demander l'e-mail (une question dont la donnée d'identité est email) : sans elle, aucune réponse publique ne peut être enregistrée.",
    );
  }

  return problems;
}

/**
 * Ids in `after` that do not name a row of `before` where they sit: a section id
 * the form does not have, an option id that is not one of that question's
 * options, or an id given twice. `before` is null for a form being created,
 * where any id is foreign. Without this, a mistyped id would quietly become a
 * new row, and on a form with responses an option rename would turn into a
 * refused delete-and-create the author never asked for.
 */
export function referenceProblems(
  before: AuthoredForm | null,
  after: AuthoredForm,
): string[] {
  const problems: string[] = [];

  const knownSections = new Set(before?.sections.map((s) => s.sectionId));
  const seenSections = new Set<string>();
  for (const s of after.sections) {
    if (!s.sectionId) continue;
    if (!knownSections.has(s.sectionId)) {
      problems.push(
        `La section « ${s.title} » porte l'identifiant « ${s.sectionId} », qui n'est pas une section de ce formulaire. Omettez sectionId pour créer une section.`,
      );
    }
    if (seenSections.has(s.sectionId)) {
      problems.push(
        `L'identifiant de section « ${s.sectionId} » est donné deux fois.`,
      );
    }
    seenSections.add(s.sectionId);
  }

  const optionsByKey = new Map(
    (before ? allQuestions(before) : []).map((q) => [
      q.key,
      new Set(q.options.map((o) => o.optionId)),
    ]),
  );
  const seenOptions = new Set<string>();
  for (const q of allQuestions(after)) {
    for (const o of q.options) {
      if (!o.optionId) continue;
      if (!optionsByKey.get(q.key)?.has(o.optionId)) {
        problems.push(
          `L'option « ${o.label} » de « ${q.key} » porte l'identifiant « ${o.optionId} », qui n'est pas une option de cette question. Omettez optionId pour créer une option.`,
        );
      }
      if (seenOptions.has(o.optionId)) {
        problems.push(
          `L'identifiant d'option « ${o.optionId} » est donné deux fois.`,
        );
      }
      seenOptions.add(o.optionId);
    }
  }

  return problems;
}

/** Where each question sits: its section's id, or a marker for a new section. */
function placements(form: AuthoredForm): Map<string, string | null> {
  const where = new Map<string, string | null>();
  for (const q of form.questions) where.set(q.key, null);
  form.sections.forEach((s, i) => {
    for (const q of s.questions) where.set(q.key, s.sectionId ?? `new:${i}`);
  });
  return where;
}

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * What going from `before` to `after` changes in the form's structure, one
 * French phrase per change. Empty when every difference is wording or a setting
 * of the form itself, which is what may still be edited once responses exist.
 * Rows are matched by identity, never by position: a question by its key, a
 * section and an option by their id.
 */
export function structuralChanges(
  before: AuthoredForm,
  after: AuthoredForm,
): string[] {
  const changes: string[] = [];

  const beforeSectionIds = before.sections.map((s) => s.sectionId!);
  const afterSectionIds = after.sections
    .map((s) => s.sectionId)
    .filter((id): id is string => !!id && beforeSectionIds.includes(id));
  for (const s of after.sections) {
    if (!s.sectionId || !beforeSectionIds.includes(s.sectionId)) {
      changes.push(`section « ${s.title} » ajoutée`);
    }
  }
  for (const s of before.sections) {
    if (!afterSectionIds.includes(s.sectionId!)) {
      changes.push(`section « ${s.title} » retirée`);
    }
  }
  if (
    !sameOrder(
      beforeSectionIds.filter((id) => afterSectionIds.includes(id)),
      afterSectionIds,
    )
  ) {
    changes.push('ordre des sections modifié');
  }

  const beforeQuestions = new Map(allQuestions(before).map((q) => [q.key, q]));
  const afterQuestions = new Map(allQuestions(after).map((q) => [q.key, q]));
  const beforePlaces = placements(before);
  const afterPlaces = placements(after);

  for (const key of afterQuestions.keys()) {
    if (!beforeQuestions.has(key)) changes.push(`question « ${key} » ajoutée`);
  }
  for (const key of beforeQuestions.keys()) {
    if (!afterQuestions.has(key)) changes.push(`question « ${key} » retirée`);
  }
  const kept = [...afterQuestions.keys()].filter((k) => beforeQuestions.has(k));
  if (
    !sameOrder(
      [...beforeQuestions.keys()].filter((k) => afterQuestions.has(k)),
      kept,
    )
  ) {
    changes.push('ordre des questions modifié');
  }

  for (const key of kept) {
    const was = beforeQuestions.get(key)!;
    const is = afterQuestions.get(key)!;
    if (beforePlaces.get(key) !== afterPlaces.get(key)) {
      changes.push(`question « ${key} » déplacée dans une autre section`);
    }
    for (const field of STRUCTURAL_QUESTION_FIELDS) {
      if (field !== 'key' && was[field] !== is[field]) {
        changes.push(`question « ${key} » : ${field} modifié`);
      }
    }

    const wasOptions = new Map(was.options.map((o) => [o.optionId!, o]));
    const keptOptions: string[] = [];
    for (const o of is.options) {
      const previous = o.optionId ? wasOptions.get(o.optionId) : undefined;
      if (!previous) {
        changes.push(`option « ${o.label} » ajoutée à « ${key} »`);
        continue;
      }
      keptOptions.push(o.optionId!);
      if (previous.kind !== o.kind) {
        changes.push(`option « ${o.label} » de « ${key} » : kind modifié`);
      }
    }
    for (const o of was.options) {
      if (!keptOptions.includes(o.optionId!)) {
        changes.push(`option « ${o.label} » retirée de « ${key} »`);
      }
    }
    if (
      !sameOrder(
        was.options
          .map((o) => o.optionId!)
          .filter((id) => keptOptions.includes(id)),
        keptOptions,
      )
    ) {
      changes.push(`ordre des options de « ${key} » modifié`);
    }
  }

  return changes;
}
