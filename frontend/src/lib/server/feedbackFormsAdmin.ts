import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getFormGraphById } from '$lib/server/feedbackForms';
import { getStorage } from '$lib/server/infra/storage';
import { copyPersonaIcon } from '$lib/server/feedbackForms/personaIcon';

/**
 * The form-level mutations: creating and copying a form (the admin API's
 * `write_feedback_form` and `write_feedback_form_copy`) and deleting an
 * unanswered one (the admin list, since a delete a model could aim on its own is
 * never an operation). What a form holds is written whole by the admin API
 * (`adminApi/writes/feedbackForms.ts`). The whole `/staff/admin/*` tree is
 * already admin-gated at the hooks level; `requireAdmin` is a defense-in-depth
 * assertion for the routes.
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

// `staffId` is the author recorded on the form, null when the caller has no staff
// profile (an admin API token can belong to none): the columns are `SetNull`
// already, since a departure must never delete a form.
export async function createForm(
  staffId: string | null,
  input: { title: string; intro?: string | null; personaName?: string | null },
): Promise<{ id: string }> {
  const slug = await uniqueSlug(input.title);
  const form = await prisma.feedback_Form.create({
    data: {
      slug,
      title: input.title,
      intro: input.intro ?? null,
      personaName: input.personaName ?? null,
      createdById: staffId,
      updatedById: staffId,
    },
    select: { id: true },
  });
  return form;
}

/** Deep-clones a form (+ sections, questions, options) into a fresh draft. */
export async function duplicateForm(
  staffId: string | null,
  sourceId: string,
): Promise<{ id: string }> {
  const src = await getFormGraphById(sourceId);
  if (!src) throw error(404, 'Formulaire introuvable.');
  const slug = await uniqueSlug(`${src.title} (copie)`);

  const created = await prisma.$transaction(async (tx) => {
    const form = await tx.feedback_Form.create({
      data: {
        slug,
        title: `${src.title} (copie)`,
        intro: src.intro,
        outro: src.outro,
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
          identityField: q.identityField,
          inputKind: q.inputKind,
          minSelections: q.minSelections,
          maxSelections: q.maxSelections,
          placeholder: q.placeholder,
          options: {
            create: q.options.map((o) => ({
              position: o.position,
              label: o.label,
              kind: o.kind,
              reaction: o.reaction,
            })),
          },
        },
      });
    }

    return { id: form.id };
  });

  // Copy the persona icon to a key the copy owns (outside the txn; S3 is not
  // transactional). Sharing one key would let either form's delete break the
  // other. Best-effort: a failed copy just leaves the copy on the default art.
  if (src.personaIconKey) {
    const key = await copyPersonaIcon(src.personaIconKey, created.id);
    if (key) {
      await prisma.feedback_Form.update({
        where: { id: created.id },
        data: {
          personaIconKey: key,
          personaIconSourceUrl: src.personaIconSourceUrl,
        },
      });
    }
  }

  return created;
}

export async function deleteForm(id: string): Promise<void> {
  const form = await prisma.feedback_Form.findUnique({
    where: { id },
    select: { personaIconKey: true },
  });
  const n = await prisma.feedback_Submission.count({ where: { formId: id } });
  if (n > 0) {
    throw error(
      409,
      'Ce formulaire a des réponses et ne peut pas être supprimé. Archivez-le.',
    );
  }
  await prisma.feedback_Form.delete({ where: { id } });
  // Reclaim the icon object after the row is gone (best-effort; no GC backstop).
  if (form?.personaIconKey) {
    await getStorage()
      .delete(form.personaIconKey)
      .catch(() => {});
  }
}
