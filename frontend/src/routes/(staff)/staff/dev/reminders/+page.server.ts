import type { PageServerLoad, Actions } from './$types';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { sendRemindersSchema } from '$lib/validation/reminders';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  sendStudentReminderEmail,
  sendParentReminderEmail,
} from '$lib/server/otp';

const COOLDOWN_DAYS = 3;

export const load: PageServerLoad = async ({ locals, url }) => {
  const db = scopedPrisma(getCampusId(locals));

  const filter = url.searchParams.get('filter') || 'all';

  const incompleteWhere: Record<string, object> = {
    student: {
      OR: [{ infoValidatedAt: null }, { rulesSignedAt: null }],
    },
    parent: {
      imageRightsSignedAt: null,
      parentEmail: { not: null },
    },
    all: {
      OR: [
        { infoValidatedAt: null },
        { rulesSignedAt: null },
        { imageRightsSignedAt: null },
      ],
    },
  };

  const talents = await db.talent.findMany({
    where: incompleteWhere[filter] || incompleteWhere.all,
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      parentEmail: true,
      parentNom: true,
      parentPrenom: true,
      infoValidatedAt: true,
      rulesSignedAt: true,
      imageRightsSignedAt: true,
      reminders: {
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { sentAt: true, type: true },
      },
    },
    orderBy: { nom: 'asc' },
  });

  const form = await superValidate(zod4(sendRemindersSchema));

  return { talents, filter, form };
};

export const actions: Actions = {
  send: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(sendRemindersSchema));

    if (!form.valid) {
      return message(form, 'Données invalides.', { status: 400 });
    }

    const { talentIds, type } = form.data;
    const db = scopedPrisma(getCampusId(locals));

    const talents = await db.talent.findMany({
      where: { id: { in: talentIds } },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        parentEmail: true,
        parentNom: true,
        infoValidatedAt: true,
        rulesSignedAt: true,
        imageRightsSignedAt: true,
        reminders: {
          where: { type },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true },
        },
      },
    });

    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);

    let sent = 0;
    let skipped = 0;

    for (const talent of talents) {
      const lastReminder = talent.reminders[0];
      if (lastReminder && lastReminder.sentAt > cooldownDate) {
        skipped++;
        continue;
      }

      try {
        if (type === 'student' && talent.email) {
          await sendStudentReminderEmail(talent.email, talent.prenom);
        } else if (type === 'parent' && talent.parentEmail) {
          await sendParentReminderEmail(
            talent.parentEmail,
            talent.parentNom || 'Parent',
            `${talent.prenom} ${talent.nom}`,
          );
        } else {
          skipped++;
          continue;
        }

        await prisma.onboardingReminder.create({
          data: {
            talentId: talent.id,
            type,
            sentBy: locals.user!.id,
          },
        });
        sent++;
      } catch {
        skipped++;
      }
    }

    const msg =
      sent > 0
        ? `${sent} relance${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}.${skipped > 0 ? ` ${skipped} ignorée${skipped > 1 ? 's' : ''} (cooldown ou email manquant).` : ''}`
        : `Aucune relance envoyée. ${skipped} ignorée${skipped > 1 ? 's' : ''} (cooldown ou email manquant).`;

    return message(form, msg);
  },
};
