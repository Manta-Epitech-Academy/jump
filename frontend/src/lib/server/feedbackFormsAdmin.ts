import { error } from '@sveltejs/kit';
import type {
  Feedback_QuestionType,
  Feedback_InputKind,
  Feedback_OptionKind,
  Feedback_FormStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '$lib/server/db';
import { assertEditable, getFormGraphById } from '$lib/server/feedbackForms';

/**
 * Admin mutations for the feedback form builder. The whole `/staff/admin/*` tree
 * is already admin-gated at the hooks level; `requireAdmin` is a defense-in-depth
 * assertion for the REST endpoints.
 *
 * Structural mutations (add / delete / reorder / retype) call `assertEditable`, so
 * once a form has responses the admin must duplicate it to restructure. Pure text
 * edits (titles, prompts, labels, flags) stay allowed.
 */
export function requireAdmin(locals: App.Locals): { staffId: string } {
  if (locals.staffProfile?.staffRole !== 'admin') {
    throw error(403, 'Réservé aux administrateurs.');
  }
  return { staffId: locals.staffProfile.id };
}

function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'formulaire'
  );
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await prisma.feedback_Form.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
}

// ─── Form ───

export async function createForm(
  staffId: string,
  input: { title: string; intro: string; personaName?: string | null },
): Promise<{ id: string }> {
  const slug = await uniqueSlug(input.title);
  const form = await prisma.feedback_Form.create({
    data: {
      slug,
      title: input.title,
      intro: input.intro,
      personaName: input.personaName ?? null,
      createdById: staffId,
      updatedById: staffId,
    },
    select: { id: true },
  });
  return form;
}

export async function updateForm(
  staffId: string,
  id: string,
  patch: {
    title?: string;
    intro?: string;
    personaName?: string | null;
    status?: Feedback_FormStatus;
    allowsAuthenticatedAccess?: boolean;
    allowsPublicAccess?: boolean;
    dashboardNudge?: boolean;
  },
): Promise<void> {
  await prisma.feedback_Form.update({
    where: { id },
    data: { ...patch, updatedById: staffId },
  });
}

/** Deep-clones a form (+ sections, questions, options) into a fresh draft. */
export async function duplicateForm(
  staffId: string,
  sourceId: string,
): Promise<{ id: string }> {
  const src = await getFormGraphById(sourceId);
  if (!src) throw error(404, 'Formulaire introuvable.');
  const slug = await uniqueSlug(`${src.title} (copie)`);

  return prisma.$transaction(async (tx) => {
    const form = await tx.feedback_Form.create({
      data: {
        slug,
        title: `${src.title} (copie)`,
        intro: src.intro,
        personaName: src.personaName,
        // A copy always starts as an editable draft, never public.
        status: 'draft',
        allowsAuthenticatedAccess: src.allowsAuthenticatedAccess,
        allowsPublicAccess: false,
        dashboardNudge: false,
        createdById: staffId,
        updatedById: staffId,
      },
      select: { id: true },
    });

    const sectionIdMap = new Map<string, string>();
    for (const s of src.sections) {
      const created = await tx.feedback_Section.create({
        data: {
          formId: form.id,
          position: s.position,
          title: s.title,
          intro: s.intro,
        },
        select: { id: true },
      });
      sectionIdMap.set(s.id, created.id);
    }

    for (const q of src.questions) {
      await tx.feedback_Question.create({
        data: {
          formId: form.id,
          sectionId: q.sectionId ? sectionIdMap.get(q.sectionId) : null,
          key: q.key,
          position: q.position,
          prompt: q.prompt,
          type: q.type,
          required: q.required,
          identity: q.identity,
          inputKind: q.inputKind,
          minSelections: q.minSelections,
          maxSelections: q.maxSelections,
          skipsIdentity: q.skipsIdentity,
          placeholder: q.placeholder,
          options: {
            create: q.options.map((o) => ({
              position: o.position,
              label: o.label,
              kind: o.kind,
            })),
          },
        },
      });
    }

    return { id: form.id };
  });
}

export async function deleteForm(id: string): Promise<void> {
  const n = await prisma.feedback_Submission.count({ where: { formId: id } });
  if (n > 0) {
    throw error(
      409,
      'Ce formulaire a des réponses et ne peut pas être supprimé. Archivez-le.',
    );
  }
  await prisma.feedback_Form.delete({ where: { id } });
}

// ─── Section ───

export async function createSection(
  formId: string,
  input: { title: string; intro?: string | null; position: number },
): Promise<{ id: string }> {
  await assertEditable(formId);
  return prisma.feedback_Section.create({
    data: {
      formId,
      title: input.title,
      intro: input.intro ?? null,
      position: input.position,
    },
    select: { id: true },
  });
}

export async function updateSection(
  id: string,
  patch: { title?: string; intro?: string | null },
): Promise<void> {
  // Text-only edit: allowed even with responses.
  await prisma.feedback_Section.update({ where: { id }, data: patch });
}

export async function deleteSection(formId: string, id: string): Promise<void> {
  await assertEditable(formId);
  await prisma.feedback_Section.delete({ where: { id } });
}

// ─── Question ───

export type QuestionStructureInput = {
  key: string;
  position: number;
  sectionId?: string | null;
  prompt: string;
  type: Feedback_QuestionType;
  required?: boolean;
  identity?: boolean;
  inputKind?: Feedback_InputKind | null;
  minSelections?: number | null;
  maxSelections?: number | null;
  skipsIdentity?: boolean;
  placeholder?: string | null;
};

/**
 * Throws 409 if `key` already belongs to another question on the form (the
 * `@@unique([formId, key])` would otherwise surface as an opaque 500). `exceptId`
 * excludes the question being renamed, so re-saving its own key is a no-op.
 */
export async function assertKeyAvailable(
  formId: string,
  key: string,
  exceptId?: string,
): Promise<void> {
  const clash = await prisma.feedback_Question.findFirst({
    where: { formId, key, id: exceptId ? { not: exceptId } : undefined },
    select: { id: true },
  });
  if (clash) throw error(409, `La clé « ${key} » existe déjà.`);
}

export async function createQuestion(
  formId: string,
  input: QuestionStructureInput,
): Promise<{ id: string }> {
  await assertEditable(formId);
  return prisma.feedback_Question.create({
    data: {
      formId,
      key: input.key,
      position: input.position,
      sectionId: input.sectionId ?? null,
      prompt: input.prompt,
      type: input.type,
      required: input.required ?? true,
      identity: input.identity ?? false,
      inputKind: input.inputKind ?? null,
      minSelections: input.minSelections ?? null,
      maxSelections: input.maxSelections ?? null,
      skipsIdentity: input.skipsIdentity ?? false,
      placeholder: input.placeholder ?? null,
    },
    select: { id: true },
  });
}

const STRUCTURAL_QUESTION_FIELDS: (keyof QuestionStructureInput)[] = [
  'key',
  'type',
  'required',
  'identity',
  'inputKind',
  'minSelections',
  'maxSelections',
  'skipsIdentity',
  'sectionId',
];

export async function updateQuestion(
  formId: string,
  id: string,
  patch: Partial<QuestionStructureInput>,
): Promise<void> {
  const touchesStructure = STRUCTURAL_QUESTION_FIELDS.some(
    (f) => patch[f] !== undefined,
  );
  if (touchesStructure) await assertEditable(formId);
  if (patch.key !== undefined) await assertKeyAvailable(formId, patch.key, id);

  const data: Prisma.Feedback_QuestionUpdateInput = {};
  if (patch.prompt !== undefined) data.prompt = patch.prompt;
  if (patch.placeholder !== undefined) data.placeholder = patch.placeholder;
  if (patch.key !== undefined) data.key = patch.key;
  if (patch.type !== undefined) data.type = patch.type;
  if (patch.required !== undefined) data.required = patch.required;
  if (patch.identity !== undefined) data.identity = patch.identity;
  if (patch.inputKind !== undefined) data.inputKind = patch.inputKind;
  if (patch.minSelections !== undefined)
    data.minSelections = patch.minSelections;
  if (patch.maxSelections !== undefined)
    data.maxSelections = patch.maxSelections;
  if (patch.skipsIdentity !== undefined)
    data.skipsIdentity = patch.skipsIdentity;
  if (patch.sectionId !== undefined) {
    data.section = patch.sectionId
      ? { connect: { id: patch.sectionId } }
      : { disconnect: true };
  }

  await prisma.feedback_Question.update({ where: { id }, data });
}

export async function deleteQuestion(
  formId: string,
  id: string,
): Promise<void> {
  await assertEditable(formId);
  await prisma.feedback_Question.delete({ where: { id } });
}

/**
 * Picks a key that doesn't collide on the form, by appending `_copie`, `_copie2`…
 * The base may already end in a digit, so we separate with `_copie`.
 */
async function uniqueQuestionKey(
  formId: string,
  base: string,
): Promise<string> {
  const taken = new Set(
    (
      await prisma.feedback_Question.findMany({
        where: { formId },
        select: { key: true },
      })
    ).map((q) => q.key),
  );
  for (let i = 0; ; i++) {
    const candidate =
      i === 0 ? `${base}_copie` : `${base}_copie${i + 1}`.slice(0, 60);
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Clones one question (+ its options) right after the source, shifting the
 * positions of every following question by one so the copy lands adjacent.
 * Structural, so it asserts the form is still editable.
 */
export async function duplicateQuestion(
  formId: string,
  sourceId: string,
): Promise<{ id: string }> {
  await assertEditable(formId);
  const src = await prisma.feedback_Question.findFirst({
    where: { id: sourceId, formId },
    include: { options: { orderBy: { position: 'asc' } } },
  });
  if (!src) throw error(404, 'Question introuvable.');

  const key = await uniqueQuestionKey(formId, src.key);
  const insertAt = src.position + 1;

  return prisma.$transaction(async (tx) => {
    await tx.feedback_Question.updateMany({
      where: { formId, position: { gte: insertAt } },
      data: { position: { increment: 1 } },
    });
    return tx.feedback_Question.create({
      data: {
        formId,
        sectionId: src.sectionId,
        key,
        position: insertAt,
        prompt: src.prompt,
        type: src.type,
        required: src.required,
        identity: src.identity,
        inputKind: src.inputKind,
        minSelections: src.minSelections,
        maxSelections: src.maxSelections,
        skipsIdentity: src.skipsIdentity,
        placeholder: src.placeholder,
        options: {
          create: src.options.map((o) => ({
            position: o.position,
            label: o.label,
            kind: o.kind,
          })),
        },
      },
      select: { id: true },
    });
  });
}

// ─── Option ───

/**
 * Throws 409 if `label` is already used by another option of the same question.
 * `recordSubmission` resolves an answer to an option by (question, label), so two
 * options sharing a label would collide there and silently misattribute answers.
 * Mirrors {@link assertKeyAvailable}; `exceptId` excludes the option being renamed.
 */
export async function assertOptionLabelAvailable(
  questionId: string,
  label: string,
  exceptId?: string,
): Promise<void> {
  const clash = await prisma.feedback_QuestionOption.findFirst({
    where: { questionId, label, id: exceptId ? { not: exceptId } : undefined },
    select: { id: true },
  });
  if (clash) throw error(409, `L'option « ${label} » existe déjà.`);
}

export async function createOption(
  formId: string,
  questionId: string,
  input: { label: string; kind?: Feedback_OptionKind; position: number },
): Promise<{ id: string }> {
  await assertEditable(formId);
  await assertOptionLabelAvailable(questionId, input.label);
  return prisma.feedback_QuestionOption.create({
    data: {
      questionId,
      label: input.label,
      kind: input.kind ?? 'choice',
      position: input.position,
    },
    select: { id: true },
  });
}

export async function updateOption(
  formId: string,
  id: string,
  patch: { label?: string; kind?: Feedback_OptionKind },
): Promise<void> {
  // Relabelling is rename-safe (answers reference the option id) -> always allowed.
  // Changing the kind is structural.
  if (patch.kind !== undefined) await assertEditable(formId);
  if (patch.label !== undefined) {
    const opt = await prisma.feedback_QuestionOption.findUnique({
      where: { id },
      select: { questionId: true },
    });
    if (opt) await assertOptionLabelAvailable(opt.questionId, patch.label, id);
  }
  await prisma.feedback_QuestionOption.update({ where: { id }, data: patch });
}

export async function deleteOption(formId: string, id: string): Promise<void> {
  await assertEditable(formId);
  await prisma.feedback_QuestionOption.delete({ where: { id } });
}

// ─── Reordering ───

export async function reorderSections(
  formId: string,
  orderedIds: string[],
): Promise<void> {
  await assertEditable(formId);
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.feedback_Section.update({
        where: { id },
        data: { position: i },
      }),
    ),
  );
}

export async function reorderQuestions(
  formId: string,
  orderedIds: string[],
): Promise<void> {
  await assertEditable(formId);
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.feedback_Question.update({
        where: { id },
        data: { position: i },
      }),
    ),
  );
}

export async function reorderOptions(
  formId: string,
  orderedIds: string[],
): Promise<void> {
  await assertEditable(formId);
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.feedback_QuestionOption.update({
        where: { id },
        data: { position: i },
      }),
    ),
  );
}
