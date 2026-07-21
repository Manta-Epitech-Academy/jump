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
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { cohortNounForms } from '$lib/domain/event';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import {
  presenceSlots,
  slotKey,
  dateKeyToDbDate,
  dbDateToKey,
  toDateKey,
  effectiveStatus,
  computeAttendanceRate,
  type PresenceRecord,
  type CellStatus,
} from '$lib/domain/eventPresence';
import { isSlotPastCutoff } from '$lib/server/presence/slotClosure';
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
import { SF_VISIBLE_STATUSES } from '$lib/domain/sfMemberStatus';
import {
  PRESENCE_ROSTER_SELECT,
  type PresenceRow,
  type EmargementCohort,
} from './components/types';

export const load: PageServerLoad = async ({ params, locals, depends }) => {
  depends('staff:event-presence');

  const campusId = getCampusId(locals);
  const timezone = getCampusTimezone(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.EMARGEMENT);
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

  // A créneau is closed either because a staff member closed it early (a closure
  // row) or because its 11h/15h cutoff has passed (campus tz). Both are derived
  // here, not written by a cron. `pastCutoffKeys` is sent on its own so the UI
  // can tell an auto-closed créneau (the clock decided, no reopen) from a manual
  // early-close (reopenable until the cutoff).
  const manualClosed = new Set(
    closureRows.map((c) => slotKey(dbDateToKey(c.day), c.slot)),
  );
  const pastCutoffKeys = slots
    .filter((s) => isSlotPastCutoff(s.day, s.slot, timezone, now))
    .map((s) => s.key);
  const pastCutoffSet = new Set(pastCutoffKeys);
  const closedKeys = slots
    .filter((s) => manualClosed.has(s.key) || pastCutoffSet.has(s.key))
    .map((s) => s.key);
  const closedSet = new Set(closedKeys);

  // Only visible SF statuses (READY, MEET) plus legacy null rows: the
  // émargement roster mirrors the inscrits filter - CONNECTED/DESISTED members
  // never appear. For a past event, a READY member with no EventPresence row
  // reads as absent in every closed slot (effectiveStatus projects pending →
  // absent), which is exactly right: "said they would come, did not."
  const sfStatusWhere = {
    OR: [
      { sfMemberStatus: { in: [...SF_VISIBLE_STATUSES] } },
      { sfMemberStatus: null },
    ],
  };

  const cohort: Promise<EmargementCohort> = (async () => {
    const [participations, presenceRows] = await Promise.all([
      db.participation.findMany({
        where: { eventId: event.id, ...sfStatusWhere },
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
      // Both guardians in priority order; drop any with no contact info at all so
      // the dialog never shows an empty "Responsable légal".
      const guardians = [
        {
          civilite: t.parentCivilite,
          name: [t.parentPrenom, t.parentNom].filter(Boolean).join(' ') || null,
          email: t.parentEmail,
          phone: t.parentPhone,
        },
        {
          civilite: t.parent2Civilite,
          name:
            [t.parent2Prenom, t.parent2Nom].filter(Boolean).join(' ') || null,
          email: t.parent2Email,
          phone: t.parent2Phone,
        },
      ].filter((g) => g.name || g.phone || g.email);

      return {
        talentId: p.talentId,
        sfMemberStatus: p.sfMemberStatus,
        nom: t.nom,
        prenom: t.prenom,
        civilite: t.civilite,
        // The talent's login-account email (bauth_user), the source of truth.
        email: t.user?.email ?? null,
        phone: t.phone,
        noteCount: t._count.notes,
        // The distinct créneaux this talent carries a note for, from each note's
        // stored anchor (notes without one — fiche notes — never light a trigger).
        noteSlotKeys: [
          ...new Set(
            t.notes
              .filter((n) => n.presenceDay && n.presenceSlot)
              .map((n) =>
                slotKey(dbDateToKey(n.presenceDay!), n.presenceSlot!),
              ),
          ),
        ],
        guardians,
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
    // For single-slot events with no manual Jump mark, SF MEET status falls back to present.
    const storedStatus = new Map(
      presences.map((p) => [`${p.talentId}|${p.day}|${p.slot}`, p.status]),
    );
    const isSingleDayEvent = slots.length <= 2;
    const effective: CellStatus[] = [];
    for (const s of slots) {
      const closed = closedSet.has(s.key);
      for (const r of rows) {
        effective.push(
          effectiveStatus(
            storedStatus.get(`${r.talentId}|${s.day}|${s.slot}`) ?? 'pending',
            closed,
            { sfMemberStatus: r.sfMemberStatus, isSingleDayEvent },
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

/** Confirm the talent is enrolled in this campus + event (roster lives on Participation). */
async function assertEnrolled(
  campusId: string,
  eventId: string,
  talentId: string,
): Promise<void> {
  const db = scopedPrisma(campusId);
  const enrolled = await db.participation.findUnique({
    where: { talentId_eventId: { talentId, eventId } },
    select: { id: true },
  });
  if (!enrolled) throw error(400, 'Talent non inscrit à cet événement.');
}

export const actions: Actions = {
  setPresence: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(setPresenceSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const event = await loadEventOr404(params.id, campusId);
    requireEventModule(event, EVENT_MODULES.EMARGEMENT);
    // Campus authorization for the write lands here: `loadEventOr404` scoped the
    // event and `assertEnrolled` the talent's participation, so the raw-client
    // write below is safe (same shape as xpService's ledger callers).
    await assertEnrolled(campusId, event.id, form.data.talentId);

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
    const event = await loadEventOr404(params.id, campusId);
    requireEventModule(event, EVENT_MODULES.EMARGEMENT);

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

    return message(
      form,
      `${cohortNounForms(event.cohortNoun).Plural} sans présence enregistrée marqués présents.`,
    );
  },

  closeSlot: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(closeSlotSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const event = await loadEventOr404(params.id, campusId);
    requireEventModule(event, EVENT_MODULES.EMARGEMENT);
    await closePresenceSlot(
      campusId,
      event.id,
      dateKeyToDbDate(form.data.day),
      form.data.slot,
      locals.staffProfile.id,
    );

    return message(form, 'Créneau clôturé.');
  },

  reopenSlot: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(reopenSlotSchema));
    if (!form.valid) return fail(400, { form });

    const campusId = getCampusId(locals);
    const event = await loadEventOr404(params.id, campusId);
    requireEventModule(event, EVENT_MODULES.EMARGEMENT);
    await reopenPresenceSlot(
      campusId,
      event.id,
      dateKeyToDbDate(form.data.day),
      form.data.slot,
    );

    return message(form, 'Créneau rouvert.');
  },
};
