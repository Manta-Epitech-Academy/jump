import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { loadStageOr404 } from '$lib/server/services/stageContext';
import { sendRelanceSchema } from '$lib/validation/reminders';
import {
  sendRelances,
  formatRelanceMessage,
} from '$lib/server/services/relanceService';
import { loadAllRelanceDefaults } from '$lib/server/services/relanceDefaults';
import { isSmsEnabled } from '$lib/server/sms';
import { ONBOARDING_FILTER_KEYS, type OnboardingFilterKey } from './filters';

function validateFilter(raw: string | null): OnboardingFilterKey {
  return (ONBOARDING_FILTER_KEYS as readonly string[]).includes(raw ?? '')
    ? (raw as OnboardingFilterKey)
    : 'all';
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireFlag(locals, 'stage_seconde');
  const campusId = getCampusId(locals);
  const event = await loadStageOr404(params.id, campusId);
  const db = scopedPrisma(campusId);
  const filter = validateFilter(url.searchParams.get('filter'));

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    include: {
      talent: {
        include: {
          // Mirrors the server's `user.email ?? talent.email` fallback so
          // the relance dialog preview agrees with what the send action
          // will actually do.
          user: { select: { email: true } },
          // Both channels, all of this type: the dialog derives the per-channel
          // cooldown (latest of the active channel) and the SMS escalation gate
          // (whether any email relance already went out) from these rows.
          reminders: {
            orderBy: { sentAt: 'desc' },
            select: { sentAt: true, type: true, channel: true },
          },
        },
      },
      stageCompliance: true,
    },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const relanceForm = await superValidate(zod4(sendRelanceSchema));
  const relanceDefaults = await loadAllRelanceDefaults();

  return {
    event,
    participations,
    relanceForm,
    relanceDefaults,
    smsEnabled: isSmsEnabled(),
    filter,
  };
};

// Maps form-side doc type identifiers to their Prisma column.
const DOC_TYPE_FIELDS = {
  charte: 'charteSigned',
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

  sendRelance: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(sendRelanceSchema));

    if (!form.valid) {
      return message(form, 'Données invalides.', { status: 400 });
    }

    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);

    const result = await sendRelances({
      ...form.data,
      sentBy: locals.user!.id,
      campusId,
    });

    return message(form, formatRelanceMessage(result));
  },
};
