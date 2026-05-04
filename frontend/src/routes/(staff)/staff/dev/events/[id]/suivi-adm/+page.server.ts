import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { loadStageOr404 } from '$lib/server/services/stageContext';
import { sendRemindersSchema } from '$lib/validation/reminders';
import {
  sendStudentReminderEmail,
  sendParentReminderEmail,
} from '$lib/server/otp';

const COOLDOWN_DAYS = 3;

export const load: PageServerLoad = async ({ params, locals }) => {
  requireFlag(locals, 'stage_seconde');
  const campusId = getCampusId(locals);
  const event = await loadStageOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    include: {
      talent: {
        include: {
          reminders: {
            orderBy: { sentAt: 'desc' },
            take: 1,
            select: { sentAt: true, type: true },
          },
        },
      },
      stageCompliance: true,
    },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const reminderForm = await superValidate(zod4(sendRemindersSchema));

  return { event, participations, reminderForm };
};

// Maps form-side doc type identifiers to their Prisma column.
const DOC_TYPE_FIELDS = {
  charte: 'charteSigned',
  convention: 'conventionSigned',
  image: 'imageRightsSigned',
} as const;
type DocType = keyof typeof DOC_TYPE_FIELDS;

export const actions: Actions = {
  toggleAdminDoc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);

    const data = await request.formData();
    const id = data.get('id');
    const docType = data.get('docType');
    const newState = data.get('state') !== 'true';

    if (typeof id !== 'string' || !id) {
      return fail(400, { error: 'Identifiant manquant' });
    }
    if (typeof docType !== 'string' || !(docType in DOC_TYPE_FIELDS)) {
      return fail(400, { error: 'Type de document invalide' });
    }

    const field = DOC_TYPE_FIELDS[docType as DocType];
    const db = scopedPrisma(campusId);

    try {
      await db.participation.findFirstOrThrow({
        where: { id, eventId: params.id },
        select: { id: true },
      });

      await prisma.stageCompliance.upsert({
        where: { participationId: id },
        create: { participationId: id, [field]: newState },
        update: { [field]: newState },
      });
      return { success: true };
    } catch {
      return fail(500, { error: 'Erreur de mise à jour' });
    }
  },

  toggleBringPc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);
    const data = await request.formData();
    return toggleBringPc(data, campusId, params.id);
  },

  sendReminders: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(sendRemindersSchema));

    if (!form.valid) {
      return message(form, 'Données invalides.', { status: 400 });
    }

    const { talentIds, type } = form.data;
    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);
    const db = scopedPrisma(campusId);

    const talents = await db.talent.findMany({
      where: { id: { in: talentIds } },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        parentEmail: true,
        parentNom: true,
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
