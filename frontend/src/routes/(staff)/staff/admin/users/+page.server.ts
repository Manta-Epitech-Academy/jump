import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { createAdminInvitationSchema } from '$lib/validation/staff';
import {
  inviteStaff,
  cancelInvitation,
  cancelInvitations,
  updateStaffCampus,
  updateStaffRole,
  deleteStaffUser,
} from '$lib/server/services/staffAdminService';

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

    const result = await inviteStaff({
      email: form.data.email,
      campusId: form.data.campusId,
      staffRole: form.data.staffRole,
      invitedByUserId: locals.user.id,
    });

    if (result.ok) return message(form, 'Invitation créée.');

    switch (result.reason) {
      case 'staff_exists':
        return message(
          form,
          'Un compte staff existe déjà avec cet email. Modifiez son rôle depuis la liste des membres.',
          { status: 400 },
        );
      case 'invitation_exists':
        return message(
          form,
          'Une invitation est déjà en attente pour cet email.',
          { status: 400 },
        );
      default:
        return message(form, "Erreur lors de la création de l'invitation.", {
          status: 500,
        });
    }
  },

  cancelInvitation: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    const result = await cancelInvitation(id);
    if (!result.ok) {
      return fail(500, { message: "Erreur lors de l'annulation." });
    }
    return { success: true };
  },

  // `ids` arrives as repeated form fields (the page posts the current selection).
  cancelInvitationsBulk: async ({ request }) => {
    const data = await request.formData();
    const ids = data
      .getAll('ids')
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (ids.length === 0) return fail(400, { message: 'Aucune invitation.' });

    const result = await cancelInvitations(ids);
    if (!result.ok) {
      return fail(500, { message: "Erreur lors de l'annulation." });
    }
    return { success: true, count: result.count };
  },

  updateCampus: async ({ request }) => {
    const data = await request.formData();
    const userId = data.get('userId') as string;
    const campusId = data.get('campusId') as string;

    if (!userId) return fail(400);

    const result = await updateStaffCampus(userId, campusId || null);
    if (!result.ok) {
      return result.reason === 'admin_has_no_campus'
        ? fail(400, { message: "Un admin n'est lié à aucun campus." })
        : fail(500, { message: 'Erreur lors de la mise à jour' });
    }
    return { success: true };
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

    const result = await updateStaffRole(userId, staffRole);
    if (!result.ok) {
      return result.reason === 'invalid_role'
        ? fail(400, { message: 'Rôle invalide' })
        : fail(500, { message: 'Erreur lors de la mise à jour du rôle' });
    }
    return { success: true };
  },

  deleteUser: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    if (id === locals.user?.id) {
      return fail(400, {
        message: 'Impossible de supprimer votre propre compte.',
      });
    }

    const result = await deleteStaffUser(id);
    if (!result.ok) {
      return fail(500, { message: 'Erreur lors de la suppression du membre.' });
    }
    return { success: true };
  },
};
