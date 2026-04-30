import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { templateSchema } from '$lib/validation/templates';
import { prisma } from '$lib/server/db';
import { processOfficialThemes } from '$lib/server/services/themes';
import {
  importSubject,
  type ImportSubjectError,
} from '$lib/server/services/subjectImporter';
import { importErrorToHttpStatus } from '$lib/server/services/subjectImportErrors';

export const load: PageServerLoad = async () => {
  const [templates, themes] = await Promise.all([
    prisma.activityTemplate.findMany({
      where: { campusId: null },
      orderBy: { createdAt: 'desc' },
      include: {
        activityTemplateThemes: { include: { theme: true } },
        subject: true,
        subjectVersion: { select: { repoCommitSha: true, importedAt: true } },
      },
    }),
    prisma.theme.findMany({
      where: { campusId: null },
      orderBy: { nom: 'asc' },
    }),
  ]);

  const form = await superValidate(zod4(templateSchema));

  return { templates, themes, form };
};

type SubjectBindResult =
  | {
      ok: true;
      subjectId: string;
      subjectVersionId: string;
      commitSha: string;
      warnings: number;
    }
  | { ok: false; status: 400 | 409 | 422 | 500; message: string };

async function resolveSubjectBinding(
  contentSource: 'inline_json' | 'github',
  repoUrl: string | undefined,
  ref: string | undefined,
  importedByStaffProfileId: string,
): Promise<SubjectBindResult | null> {
  if (contentSource !== 'github') return null;
  if (!repoUrl) {
    return {
      ok: false,
      status: 400,
      message: "L'URL du repo GitHub est requise",
    };
  }
  try {
    const result = await importSubject({
      repoUrl,
      ref: ref || undefined,
      importedByStaffProfileId,
    });
    return {
      ok: true,
      subjectId: result.subjectId,
      subjectVersionId: result.subjectVersionId,
      commitSha: result.commitSha,
      warnings: result.warnings.length,
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'kind' in err && 'message' in err) {
      const e = err as ImportSubjectError;
      return {
        ok: false,
        status: importErrorToHttpStatus(e.kind),
        message: e.message,
      };
    }
    console.error('[Subject import] failed:', err);
    return {
      ok: false,
      status: 500,
      message: err instanceof Error ? err.message : 'Erreur inconnue',
    };
  }
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(templateSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const themeIds = await processOfficialThemes(form.data.themes);
      const isDynamic = form.data.isDynamic as boolean;
      const contentSource = form.data.contentSource;
      const isGithub = isDynamic && contentSource === 'github';

      const binding = await resolveSubjectBinding(
        isDynamic ? contentSource : 'inline_json',
        form.data.repoUrl,
        form.data.ref,
        locals.staffProfile!.id,
      );
      if (binding && !binding.ok) {
        return message(form, binding.message, { status: binding.status });
      }

      const contentStructure =
        isDynamic && !isGithub && form.data.contentStructure
          ? JSON.parse(form.data.contentStructure)
          : null;
      const content =
        !isDynamic && form.data.content ? form.data.content : null;

      await prisma.activityTemplate.create({
        data: {
          nom: form.data.nom,
          description: form.data.description || null,
          difficulte: form.data.difficulte || null,
          activityType: form.data.activityType,
          isDynamic,
          defaultDuration: form.data.defaultDuration || null,
          link: form.data.link || null,
          content,
          contentStructure,
          subjectId: binding?.ok ? binding.subjectId : null,
          subjectVersionId: binding?.ok ? binding.subjectVersionId : null,
          campusId: null,
          activityTemplateThemes: {
            create: themeIds.map((themeId) => ({ themeId })),
          },
        },
      });

      const successMessage = binding?.ok
        ? `Template officiel publié ! (commit ${binding.commitSha.slice(0, 7)}${binding.warnings > 0 ? `, ${binding.warnings} référence${binding.warnings > 1 ? 's' : ''} non résolue${binding.warnings > 1 ? 's' : ''}` : ''})`
        : 'Template officiel publié !';
      return message(form, successMessage);
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la création', { status: 500 });
    }
  },

  update: async ({ request, locals }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(templateSchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { form });

    try {
      const themeIds = await processOfficialThemes(form.data.themes);
      const isDynamic = form.data.isDynamic as boolean;
      const contentSource = form.data.contentSource;
      const isGithub = isDynamic && contentSource === 'github';

      const binding = await resolveSubjectBinding(
        isDynamic ? contentSource : 'inline_json',
        form.data.repoUrl,
        form.data.ref,
        locals.staffProfile!.id,
      );
      if (binding && !binding.ok) {
        return message(form, binding.message, { status: binding.status });
      }

      const contentStructure =
        isDynamic && !isGithub && form.data.contentStructure
          ? JSON.parse(form.data.contentStructure)
          : null;
      const content =
        !isDynamic && form.data.content ? form.data.content : null;

      await prisma.activityTemplate.update({
        where: { id },
        data: {
          nom: form.data.nom,
          description: form.data.description || null,
          difficulte: form.data.difficulte || null,
          activityType: form.data.activityType,
          isDynamic,
          defaultDuration: form.data.defaultDuration || null,
          link: form.data.link || null,
          content,
          contentStructure,
          subjectId: binding?.ok ? binding.subjectId : null,
          subjectVersionId: binding?.ok ? binding.subjectVersionId : null,
          activityTemplateThemes: {
            deleteMany: {},
            create: themeIds.map((themeId) => ({ themeId })),
          },
        },
      });

      const successMessage = binding?.ok
        ? `Template officiel mis à jour ! (commit ${binding.commitSha.slice(0, 7)}${binding.warnings > 0 ? `, ${binding.warnings} référence${binding.warnings > 1 ? 's' : ''} non résolue${binding.warnings > 1 ? 's' : ''}` : ''})`
        : 'Template officiel mis à jour !';
      return message(form, successMessage);
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la modification', { status: 500 });
    }
  },

  delete: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.activityTemplate.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
