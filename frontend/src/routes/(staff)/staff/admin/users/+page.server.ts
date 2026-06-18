import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { Prisma, type StaffRole } from '@prisma/client';
import { staffRoles, bauthRoleForStaffRole } from '$lib/domain/staff';
import { createAdminInvitationSchema } from '$lib/validation/staff';

export const load: PageServerLoad = async ({ locals }) => {
  // Select only the columns the page renders. `include` here used to drag the
  // full bauth_user row (every BetterAuth column) plus full campus rows for both
  // members and invitations, ballooning the SSR payload (~1.1 MB / 10 KB a row)
  // even though the tables show name/email/role/campus and nothing else.
  const [members, invitations, campuses] = await Promise.all([
    prisma.bauth_user.findMany({
      where: { staffProfile: { isNot: null } },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        staffProfile: {
          select: {
            staffRole: true,
            campusId: true,
            campus: { select: { name: true } },
          },
        },
      },
    }),
    // Invitations are pending by construction: the OAuth callback deletes the
    // row on first sign-in, so this list never accumulates accepted ones.
    prisma.staffInvitation.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        staffRole: true,
        createdAt: true,
        campus: { select: { name: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
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

  // Bulk-cancel selected pending invitations — clears the stale backlog in one
  // shot rather than one delete per row. `ids` arrives as repeated form fields.
  cancelInvitationsBulk: async ({ request }) => {
    const data = await request.formData();
    const ids = data
      .getAll('ids')
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (ids.length === 0) return fail(400, { message: 'Aucune invitation.' });

    try {
      const { count } = await prisma.staffInvitation.deleteMany({
        where: { id: { in: ids } },
      });
      return { success: true, count };
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
      await prisma.$transaction([
        prisma.staffProfile.upsert({
          where: { userId },
          update: {
            staffRole: validRole,
            ...(validRole === 'admin' ? { campusId: null } : {}),
          },
          create: {
            userId,
            staffRole: validRole,
          },
        }),
        prisma.bauth_user.update({
          where: { id: userId },
          data: { role: bauthRoleForStaffRole(validRole) },
        }),
      ]);
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
