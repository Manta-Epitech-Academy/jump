import type { PageServerLoad, Actions } from './$types';
import { fail, error } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { Prisma } from '@prisma/client';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  createSuperDevInvitationSchema,
  updateMemberRoleSchema,
} from '$lib/validation/staff';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaffGroup(locals, 'devLead');

  const campusId = locals.staffProfile.campusId;
  if (!campusId) {
    throw error(400, 'Votre profil n’est pas rattaché à un campus.');
  }

  const [members, invitations, inviteForm] = await Promise.all([
    prisma.bauth_user.findMany({
      where: {
        staffProfile: { campusId },
        id: { not: locals.user!.id },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      include: { staffProfile: { include: { campus: true } } },
    }),
    prisma.staffInvitation.findMany({
      where: { campusId },
      include: { invitedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    superValidate(zod4(createSuperDevInvitationSchema)),
  ]);

  return { members, invitations, inviteForm };
};

export const actions: Actions = {
  invite: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const campusId = locals.staffProfile.campusId;
    if (!campusId) return fail(400, { message: 'Campus manquant.' });

    const form = await superValidate(
      request,
      zod4(createSuperDevInvitationSchema),
    );
    if (!form.valid) return fail(400, { form });

    const email = form.data.email.toLowerCase();

    const [existingUser, existingInvite] = await Promise.all([
      prisma.bauth_user.findUnique({ where: { email } }),
      prisma.staffInvitation.findUnique({ where: { email } }),
    ]);

    if (existingUser) {
      return message(form, 'Un compte existe déjà avec cet email.', {
        status: 400,
      });
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
          campusId,
          staffRole: form.data.staffRole,
          invitedByUserId: locals.user!.id,
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

  cancelInvitation: async ({ url, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    const invitation = await prisma.staffInvitation.findUnique({
      where: { id },
    });
    if (!invitation) return fail(404);
    if (invitation.campusId !== locals.staffProfile.campusId) {
      return fail(403, { message: 'Invitation hors de votre campus.' });
    }

    try {
      await prisma.staffInvitation.delete({ where: { id } });
      return { success: true };
    } catch {
      return fail(500, { message: "Erreur lors de l'annulation." });
    }
  },

  updateMemberRole: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(updateMemberRoleSchema));
    if (!form.valid) return fail(400, { form });

    const target = await prisma.staffProfile.findUnique({
      where: { userId: form.data.userId },
    });
    if (!target) return fail(404, { message: 'Membre introuvable.' });
    if (target.campusId !== locals.staffProfile.campusId) {
      return fail(403, { message: 'Membre hors de votre campus.' });
    }
    if (target.staffRole === 'admin') {
      return fail(403, { message: 'Impossible de modifier un admin.' });
    }

    try {
      await prisma.staffProfile.update({
        where: { userId: form.data.userId },
        data: { staffRole: form.data.staffRole },
      });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la mise à jour du rôle.' });
    }
  },
};
