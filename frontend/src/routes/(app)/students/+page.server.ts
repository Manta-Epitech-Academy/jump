import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';

const PER_PAGE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const search = url.searchParams.get('q') || '';
  const niveau = url.searchParams.get('niveau') || '';
  const db = scopedPrisma(getCampusId(locals));

  const where: any = {};

  if (search) {
    const sanitized = search.replace(/[^a-zA-ZÀ-ÿ0-9\s'-]/g, '').trim();
    if (sanitized) {
      where.OR = [
        { nom: { contains: sanitized, mode: 'insensitive' } },
        { prenom: { contains: sanitized, mode: 'insensitive' } },
      ];
    }
  }

  if (niveau) {
    where.niveau = niveau;
  }

  const [students, totalItems] = await Promise.all([
    db.talent.findMany({
      where,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { user: true },
    }),
    db.talent.count({ where }),
  ]);

  const form = await superValidate(zod4(studentSchema));

  return {
    students,
    totalPages: Math.ceil(totalItems / PER_PAGE),
    totalItems,
    currentPage: page,
    form,
  };
};

export const actions: Actions = {
  update: async ({ request, locals }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(studentSchema));
    const id = formData.get('id') as string;
    if (!form.valid || !id) return fail(400, { form });
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.talent.update({
        where: { id },
        data: {
          nom: form.data.nom,
          prenom: form.data.prenom,
          niveau: form.data.niveau || null,
          niveauDifficulte: form.data.niveau_difficulte || 'Débutant',
          parentEmail: form.data.parent_email || null,
          parentPhone: form.data.parent_phone || null,
          phone: form.data.phone || null,
        },
      });

      if (form.data.email) {
        const profile = await db.talent.findUniqueOrThrow({
          where: { id },
        });
        if (profile.userId) {
          await prisma.bauth_user.update({
            where: { id: profile.userId },
            data: { email: form.data.email },
          });
        }
      }

      return message(form, 'Élève modifié avec succès !');
    } catch (err: any) {
      if (err.code === 'P2002') {
        return message(form, 'Un élève avec ce nom et cet email existe déjà.', {
          status: 400,
        });
      }
      return message(form, 'Erreur lors de la modification', { status: 500 });
    }
  },

  delete: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    const db = scopedPrisma(getCampusId(locals));

    try {
      const profile = await db.talent.findUniqueOrThrow({
        where: { id },
      });
      if (profile.userId) {
        await prisma.bauth_user.delete({ where: { id: profile.userId } });
      } else {
        await db.talent.delete({ where: { id } });
      }
      return { success: true };
    } catch {
      return fail(500);
    }
  },
};
