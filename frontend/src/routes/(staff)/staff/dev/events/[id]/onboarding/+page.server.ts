import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { loadStageOr404, daysUntil } from '$lib/server/services/stageContext';
import { sendRelanceSchema } from '$lib/validation/reminders';
import {
  sendRelances,
  formatRelanceMessage,
} from '$lib/server/services/relanceService';
import { loadAllRelanceDefaults } from '$lib/server/services/relanceDefaults';
import { isSmsEnabled } from '$lib/server/sms';
import {
  emptyReminderSummary,
  type ReminderSummary,
} from '$lib/domain/relance';
import type { RelanceChannel, RelanceType } from '$lib/domain/relance';
import { ONBOARDING_FILTER_KEYS, type OnboardingFilterKey } from './filters';

function validateFilter(raw: string | null): OnboardingFilterKey {
  return (ONBOARDING_FILTER_KEYS as readonly string[]).includes(raw ?? '')
    ? (raw as OnboardingFilterKey)
    : 'all';
}

/**
 * Latest `sentAt` per (talent, audience type, channel) for the event's cohort,
 * folded into a compact `ReminderSummary` keyed by talentId. One `groupBy`
 * replaces the per-row `reminders[]` array we used to ship to the client.
 * Scoped by the event relation (the event is already campus-bound), so it does
 * not depend on the loaded participation rows and runs in parallel with them.
 */
async function loadReminderSummaries(
  eventId: string,
): Promise<Map<string, ReminderSummary>> {
  const grouped = await prisma.onboardingReminder.groupBy({
    by: ['talentId', 'type', 'channel'],
    where: { talent: { participations: { some: { eventId } } } },
    _max: { sentAt: true },
  });

  const byTalent = new Map<string, ReminderSummary>();
  for (const g of grouped) {
    const type = g.type as RelanceType;
    const channel = g.channel as RelanceChannel;
    if (type !== 'student' && type !== 'parent') continue;
    if (channel !== 'email' && channel !== 'sms') continue;
    let summary = byTalent.get(g.talentId);
    if (!summary) {
      summary = emptyReminderSummary();
      byTalent.set(g.talentId, summary);
    }
    summary[type][channel] = g._max.sentAt;
  }
  return byTalent;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireFlag(locals, 'stage_seconde');
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  const filter = validateFilter(url.searchParams.get('filter'));

  // The event guard, the empty relance form, and the admin-bound templates are
  // mutually independent, so resolve them together rather than in a chain.
  const [event, relanceForm, relanceDefaults] = await Promise.all([
    loadStageOr404(params.id, campusId),
    superValidate(zod4(sendRelanceSchema)),
    loadAllRelanceDefaults(),
  ]);

  // Cohort rows and the compact reminder history both key off the event alone.
  // The summary replaces an unbounded per-row `reminders[]` array; it feeds the
  // table's "Dernière relance" column and the relance dialog's per-channel
  // cooldown / SMS-escalation gate. Run them in parallel.
  const [rows, summaryByTalent] = await Promise.all([
    db.participation.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        talentId: true,
        bringPc: true,
        stageCompliance: { select: { charteSigned: true } },
        talent: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            parentNom: true,
            parentPrenom: true,
            email: true,
            parentEmail: true,
            phone: true,
            parentPhone: true,
            // Compliance signals: the table badges read these and the relance
            // dialog's `classifyRelanceSkip` derives the "completed" skip from them.
            parentRulesSignedAt: true,
            imageRightsDecision: true,
            imageRightsDecidedAt: true,
            infoValidatedAt: true,
            rulesSignedAt: true,
            charterAcceptedAt: true,
            // Mirrors the server's `user.email ?? talent.email` fallback so the
            // relance dialog preview agrees with what the send action will do.
            user: { select: { email: true } },
          },
        },
      },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    loadReminderSummaries(event.id),
  ]);

  const participations = rows.map((p) => ({
    ...p,
    reminderSummary: summaryByTalent.get(p.talentId) ?? emptyReminderSummary(),
  }));

  return {
    event,
    participations,
    relanceForm,
    relanceDefaults,
    smsEnabled: isSmsEnabled(),
    // Campus-scoped relance variables ({{campus}}, {{email_contact_campus}})
    // the server substitutes at send time — surfaced so the compose preview
    // renders them instead of leaving raw tokens. Already on locals, no query.
    campus: {
      name: locals.staffProfile?.campus?.name ?? '',
      contactEmail: locals.staffProfile?.campus?.contactEmail ?? null,
    },
    // Countdown to this event for the {{jours_restants}} token — same value the
    // send action resolves, surfaced so the preview shows the real number.
    joursRestants: daysUntil(event.date),
    filter,
  };
};

// Maps form-side doc type identifiers to their Prisma column. Image rights are
// no longer staff-toggled — they reflect the guardian's online decision — so
// only the charte (paper signature fallback) remains togglable here.
const DOC_TYPE_FIELDS = {
  charte: 'charteSigned',
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
    const event = await loadStageOr404(params.id, campusId);

    const result = await sendRelances({
      ...form.data,
      sentBy: locals.user!.id,
      campusId,
      joursRestants: daysUntil(event.date),
    });

    return message(form, formatRelanceMessage(result));
  },
};
