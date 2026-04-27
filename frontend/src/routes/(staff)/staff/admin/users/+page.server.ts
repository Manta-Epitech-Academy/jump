import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { Prisma, type StaffRole } from '@prisma/client';
import { staffRoles } from '$lib/domain/staff';
import { createAdminInvitationSchema } from '$lib/validation/staff';

export const load: PageServerLoad = async ({ locals }) => {
  const [members, invitations, campuses] = await Promise.all([
    prisma.bauth_user.findMany({
      where: { staffProfile: { isNot: null } },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      include: { staffProfile: { include: { campus: true } } },
    }),
    prisma.staffInvitation.findMany({
      include: {
        campus: true,
        invitedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.campus.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const inviteForm = await superValidate(zod4(createAdminInvitationSchema));

  return {
    members,
    invitations,
    campuses,
    inviteForm,
    currentUserId: locals.user?.id ?? null,
  };
};

export const actions: Actions = {
  invite: async ({ request, locals }) => {
    if (!locals.user) return fail(401);

    const form = await superValidate(
      request,
      zod4(createAdminInvitationSchema),
    );
    if (!form.valid) return fail(400, { form });

    const email = form.data.email.toLowerCase();

    const [existingStaff, existingInvite] = await Promise.all([
      prisma.staffProfile.findFirst({ where: { user: { email } } }),
      prisma.staffInvitation.findUnique({ where: { email } }),
    ]);

    if (existingStaff) {
      return message(
        form,
        'Un compte staff existe déjà avec cet email. Modifiez son rôle depuis la liste des membres.',
        { status: 400 },
      );
    }
    if (existingInvite) {
      return message(
        form,
        'Une invitation est déjà en attente pour cet email.',
        {
          status: 400,
        },
      );
    }

    try {
      await prisma.staffInvitation.create({
        data: {
          email,
          campusId: form.data.staffRole === 'admin' ? null : form.data.campusId,
          staffRole: form.data.staffRole,
          invitedByUserId: locals.user.id,
        },
      });
      return message(form, 'Invitation créée.');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return message(
          form,
          'Une invitation est déjà en attente pour cet email.',
          { status: 400 },
        );
      }
      console.error(err);
      return message(form, "Erreur lors de la création de l'invitation.", {
        status: 500,
      });
    }
  },

  cancelInvitation: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.staffInvitation.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return fail(500, { message: "Erreur lors de l'annulation." });
    }
  },

  updateCampus: async ({ request }) => {
    const data = await request.formData();
    const userId = data.get('userId') as string;
    const campusId = data.get('campusId') as string;

    if (!userId) return fail(400);

    const existing = await prisma.staffProfile.findUnique({
      where: { userId },
      select: { staffRole: true },
    });
    if (existing?.staffRole === 'admin') {
      return fail(400, { message: "Un admin n'est lié à aucun campus." });
    }

    try {
      await prisma.staffProfile.upsert({
        where: { userId },
        update: { campusId: campusId || null },
        create: { userId, campusId: campusId || null },
      });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la mise à jour' });
    }
  },

  updateRole: async ({ request, locals }) => {
    const data = await request.formData();
    const userId = data.get('userId') as string;
    const staffRole = data.get('staffRole') as string;

    if (!userId) return fail(400);
    if (userId === locals.user?.id) {
      return fail(400, {
        message: 'Impossible de modifier votre propre rôle.',
      });
    }

    const validRole: StaffRole | null = staffRole
      ? staffRoles.includes(staffRole as StaffRole)
        ? (staffRole as StaffRole)
        : null
      : null;

    if (staffRole && !validRole) return fail(400, { message: 'Rôle invalide' });

    try {
      await prisma.staffProfile.upsert({
        where: { userId },
        update: {
          staffRole: validRole,
          ...(validRole === 'admin' ? { campusId: null } : {}),
        },
        create: {
          userId,
          staffRole: validRole,
        },
      });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la mise à jour du rôle' });
    }
  },

  deleteUser: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    if (id === locals.user?.id) {
      return fail(400, {
        message: 'Impossible de supprimer votre propre compte.',
      });
    }

    try {
      await prisma.bauth_user.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la suppression du membre.' });
    }
  },
};
