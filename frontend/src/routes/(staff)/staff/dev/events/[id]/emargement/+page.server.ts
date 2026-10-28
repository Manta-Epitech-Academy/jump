import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { recomputeEventsCount } from '$lib/server/services/xpService';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { cohortNounForms } from '$lib/domain/event';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import {
  presenceSlots,
  isPresenceSlot,
  slotKey,
  dateKeyToDbDate,
  dbDateToKey,
  toDateKey,
  effectiveStatus,
  computeAttendanceRate,
  indexPresences,
  cellOf,
  type PresenceRecord,
  type PresenceSlot,
  type CellStatus,
} from '$lib/domain/eventPresence';
import {
  isSlotClosed,
  isSlotPastCutoff,
} from '$lib/server/presence/slotClosure';
import {
  closePresenceSlot,
  reopenPresenceSlot,
  markAllPresentInSlot,
} from '$lib/server/services/presenceService';
import {
  setPresenceSchema,
  markAllPresentSchema,
  closeSlotSchema,
  reopenSlotSchema,
} from '$lib/validation/presence';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  PRESENCE_ROSTER_SELECT,
  type PresenceRow,
  type EmargementCohort,
} from './components/types';

export const load: PageServerLoad = async ({ params, locals, depends }) => {
  depends('staff:event-presence');

  const campusId = getCampusId(locals);
  const timezone = getCampusTimezone(locals);
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.EMARGEMENT,
  );
  const db = scopedPrisma(campusId);

  const now = new Date();
  const slots = presenceSlots(event, timezone);

  // Closures are a small table (only manually-closed slots) and independent of
  // the ~200-row roster, so resolve them in the shell and keep slots / closedKeys
  // / pastCutoffKeys synchronous: the header QR button reads the closed-state on
  // first paint, and the active-slot filter inits from `slots`. Only the heavy
  // roster join + presence grid + the O(rows×slots) attendance rate stream.
  const closureRows = await db.eventPresenceClosure.findMany({
    where: { eventId: event.id },
    select: { day: true, slot: true },
  });

  // Closed = closed early by a staff member or past its 11h/15h cutoff
  // (`isSlotClosed`), derived here rather than written by a cron.
  // `pastCutoffKeys` is sent on its own so the UI can tell an auto-closed
  // créneau (the clock decided, no reopen) from a manual early-close
  // (reopenable until the cutoff).
  const pastCutoffKeys = slots
    .filter((s) => isSlotPastCutoff(s.day, s.slot, timezone, now))
    .map((s) => s.key);
  const closedKeys = slots
    .filter((s) => isSlotClosed(s.day, s.slot, closureRows, timezone, now))
    .map((s) => s.key);
  const closedSet = new Set(closedKeys);

  const cohort: Promise<EmargementCohort> = (async () => {
    const [participations, presenceRows] = await Promise.all([
      db.participation.findMany({
        // The enrolments the dev space shows, the same cohort as the inscrits
        // page. An unmarked member reads as absent in every closed slot
        // (effectiveStatus projects pending → absent), whatever Salesforce says.
        where: { eventId: event.id, ...visibleParticipationWhere },
        select: PRESENCE_ROSTER_SELECT,
        orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      }),
      db.eventPresence.findMany({
        where: { eventId: event.id },
        select: {
          talentId: true,
          day: true,
          slot: true,
          status: true,
          source: true,
        },
      }),
    ]);

    const rows: PresenceRow[] = participations.map((p) => {
      const t = p.talent;

      return {
        talentId: p.talentId,
        nom: t.nom,
        prenom: t.prenom,
        noteCount: t._count.notes,
        // The distinct créneaux this talent carries a note for, from each note's
        // stored anchor (notes without one, fiche notes, never light a trigger).
        noteSlotKeys: [
          ...new Set(
            t.notes
              .filter((n) => n.presenceDay && n.presenceSlot)
              .map((n) =>
                slotKey(dbDateToKey(n.presenceDay!), n.presenceSlot!),
              ),
          ),
        ],
      };
    });

    const presences: PresenceRecord[] = presenceRows.map((r) => ({
      talentId: r.talentId,
      day: dbDateToKey(r.day),
      slot: r.slot,
      status: r.status,
      source: r.source,
    }));

    // Stage attendance rate over the whole grid: project every unmarked cell in a
    // CLOSED créneau to absent (open créneaux stay pending and are ignored).
    const index = indexPresences(presences);
    const effective: CellStatus[] = [];
    for (const s of slots) {
      const closed = closedSet.has(s.key);
      for (const r of rows) {
        effective.push(
          effectiveStatus(
            cellOf(index, r.talentId, s.day, s.slot).status,
            closed,
          ),
        );
      }
    }
    const attendanceRate = computeAttendanceRate(effective);

    return { rows, presences, attendanceRate };
  })();

  return {
    event: {
      id: event.id,
      titre: event.titre,
      publicName: event.publicName,
      cohortNoun: event.cohortNoun,
    },
    timezone,
    slots,
    todayKey: toDateKey(now, timezone),
    closedKeys,
    pastCutoffKeys,
    // Un-awaited on purpose: SvelteKit streams it so the shell paints first.
    cohort,
  };
};

/** Refuse a créneau the event does not have (the grid no longer lists it). */
function requirePresenceSlot(
  event: { date: Date; endDate: Date | null; startMinutes: number | null },
  timezone: string,
  day: string,
  slot: PresenceSlot,
): void {
  if (!isPresenceSlot(event, timezone, day, slot)) {
    throw error(400, "Ce créneau n'appartient pas à l'événement.");
  }
}

/**
 * Confirm the talent is on this event's sheet: enrolled for this campus and
 * shown in the dev space, the roster the page lists. A masked enrolment is
 * still an enrolment, which is why the refusal does not say "non inscrit".
 */
async function assertOnSheet(
  campusId: string,
  eventId: string,
  talentId: string,
): Promise<void> {
  const db = scopedPrisma(campusId);
  const onSheet = await db.participation.findFirst({
    where: { talentId, eventId, ...visibleParticipationWhere },
    select: { id: true },
  });
  if (!onSheet) {
    throw error(
      400,
      "Ce talent ne figure pas sur la feuille d'émargement de cet événement.",
    );
  }
}

export const actions: Actions = {
  setPresence: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(setPresenceSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const event = await loadEventOr404(
      params.id,
      campusId,
      EVENT_MODULES.EMARGEMENT,
    );
    requirePresenceSlot(
      event,
      getCampusTimezone(locals),
      form.data.day,
      form.data.slot,
    );
    // Campus authorization for the write lands here: `loadEventOr404` scoped the
    // event and `assertOnSheet` the talent's participation, so the raw-client
    // write below is safe (same shape as xpService's ledger callers).
    await assertOnSheet(campusId, event.id, form.data.talentId);

    const day = dateKeyToDbDate(form.data.day);
    const { talentId, slot, status } = form.data;

    // The presence write and the `eventsCount` projection commit together: a
    // mark/unmark can change whether this event counts as attended, so refresh
    // the cached count in the same transaction.
    await prisma.$transaction(async (tx) => {
      if (status === 'pending') {
        // Reset the cell back to "en attente": drop the row entirely.
        await tx.eventPresence.deleteMany({
          where: { talentId, eventId: event.id, day, slot },
        });
      } else {
        const common = {
          status,
          source: 'manual' as const,
          markedById: locals.staffProfile.id,
          markedAt: new Date(),
        };
        await tx.eventPresence.upsert({
          where: {
            talentId_eventId_day_slot: {
              talentId,
              eventId: event.id,
              day,
              slot,
            },
          },
          create: { talentId, eventId: event.id, day, slot, ...common },
          update: common,
        });
      }
      await recomputeEventsCount(tx, talentId);
    });

    recordUsage(USAGE_FEATURES.DEV_EMARGEMENT_MARK, {
      locals,
      eventId: event.id,
    });

    return message(
      form,
      status === 'pending'
        ? 'Présence réinitialisée.'
        : 'Présence enregistrée.',
    );
  },

  markAllPresent: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(markAllPresentSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const event = await loadEventOr404(
      params.id,
      campusId,
      EVENT_MODULES.EMARGEMENT,
    );
    requirePresenceSlot(
      event,
      getCampusTimezone(locals),
      form.data.day,
      form.data.slot,
    );

    const result = await markAllPresentInSlot(
      campusId,
      event.id,
      dateKeyToDbDate(form.data.day),
      form.data.slot,
      locals.staffProfile.id,
    );

    if (result.status === 'closed') {
      return message(
        form,
        'Ce créneau a été clôturé : rouvrez-le pour marquer tout le monde présent.',
        { status: 409 },
      );
    }

    recordUsage(USAGE_FEATURES.DEV_EMARGEMENT_MARK_ALL, {
      locals,
      eventId: event.id,
    });

    const noun = cohortNounForms(event.cohortNoun);
    return message(
      form,
      result.marked === 0
        ? 'Tout le monde avait déjà une présence sur ce créneau.'
        : `${result.marked} ${result.marked > 1 ? noun.plural : noun.singular} marqué${result.marked > 1 ? 's' : ''} présent${result.marked > 1 ? 's' : ''}.`,
    );
  },

  closeSlot: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(closeSlotSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const event = await loadEventOr404(
      params.id,
      campusId,
      EVENT_MODULES.EMARGEMENT,
    );
    requirePresenceSlot(
      event,
      getCampusTimezone(locals),
      form.data.day,
      form.data.slot,
    );
    const { absent } = await closePresenceSlot(
      campusId,
      event.id,
      dateKeyToDbDate(form.data.day),
      form.data.slot,
      locals.staffProfile.id,
    );

    recordUsage(USAGE_FEATURES.DEV_EMARGEMENT_SLOT_CLOSE, {
      locals,
      eventId: event.id,
    });

    return message(
      form,
      absent === 0
        ? 'Créneau clôturé : tout le monde y avait une présence.'
        : `Créneau clôturé : ${absent} absent${absent > 1 ? 's' : ''} noté${absent > 1 ? 's' : ''}.`,
    );
  },

  reopenSlot: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(reopenSlotSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const event = await loadEventOr404(
      params.id,
      campusId,
      EVENT_MODULES.EMARGEMENT,
    );
    requirePresenceSlot(
      event,
      getCampusTimezone(locals),
      form.data.day,
      form.data.slot,
    );
    await reopenPresenceSlot(
      campusId,
      event.id,
      dateKeyToDbDate(form.data.day),
      form.data.slot,
    );

    recordUsage(USAGE_FEATURES.DEV_EMARGEMENT_SLOT_REOPEN, {
      locals,
      eventId: event.id,
    });

    return message(form, 'Créneau rouvert.');
  },
};
