import type { PageServerLoad, Actions } from './$types';
import { fail, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_TYPES } from '$lib/domain/event';

function splitName(name: string): { prenom: string; nom: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { prenom: parts[0] ?? '', nom: '' };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

async function campusEventExtIds(campusId: string): Promise<string[]> {
  const events = await prisma.event.findMany({
    where: { campusId, externalId: { not: null } },
    select: { externalId: true },
  });
  return events.map((e) => e.externalId).filter((x): x is string => !!x);
}

export const load: PageServerLoad = async ({ locals }) => {
  requireStaffGroup(locals, 'devMember');
  requireFlag(locals, 'staff_sync_errors');

  const campusId = locals.staffProfile?.campusId;
  if (!campusId) {
    throw error(400, "Votre profil n'est pas rattaché à un campus.");
  }

  const campusEvents = await prisma.event.findMany({
    where: { campusId, externalId: { not: null } },
    select: { externalId: true, titre: true, eventType: true },
  });
  const eventMap = new Map(
    campusEvents.map((e) => [
      e.externalId!,
      { titre: e.titre, eventType: e.eventType },
    ]),
  );
  const eventExtIds = [...eventMap.keys()];

  const errors = eventExtIds.length
    ? await prisma.syncError.findMany({
        where: { resolved: false, eventExtId: { in: eventExtIds } },
        orderBy: { lastOccurredAt: 'desc' },
      })
    : [];

  // Lookup both colliding talents for their displayed identity (real
  // prenom/nom/phone where we have it). The stage-vs-coding-club category is
  // derived from the colliding event below, not from the talents.
  const extIds = [
    ...new Set(
      errors
        .flatMap((e) => [e.attemptedExtId, e.existingExtId])
        .filter(Boolean),
    ),
  ] as string[];
  const talents = extIds.length
    ? await prisma.talent.findMany({
        where: { externalId: { in: extIds } },
        select: {
          externalId: true,
          prenom: true,
          nom: true,
          phone: true,
        },
      })
    : [];
  const talentByExtId = new Map(
    talents.map((t) => [t.externalId!, t] as const),
  );

  const rows = errors.map((e) => {
    const attemptedTalent = talentByExtId.get(e.attemptedExtId) ?? null;
    const existingTalent = e.existingExtId
      ? (talentByExtId.get(e.existingExtId) ?? null)
      : null;

    const fallback = splitName(e.talentName);
    const event = e.eventExtId ? eventMap.get(e.eventExtId) : null;
    // Urgent when the import that collided was a stage de seconde — see
    // countCampusSyncErrors for why the event, not the talents, is the source.
    const isStage = event?.eventType === EVENT_TYPES.STAGE_SECONDE;

    return {
      id: e.id,
      email: e.email,
      message: e.message,
      occurrenceCount: e.occurrenceCount,
      createdAt: e.createdAt.toISOString(),
      lastOccurredAt: e.lastOccurredAt.toISOString(),
      eventName: event?.titre ?? null,
      isStage,
      attempted: {
        extId: e.attemptedExtId,
        prenom: attemptedTalent?.prenom ?? fallback.prenom,
        nom: attemptedTalent?.nom ?? fallback.nom,
        phone: attemptedTalent?.phone ?? null,
      },
      existing: e.existingExtId
        ? {
            extId: e.existingExtId,
            prenom: existingTalent?.prenom ?? null,
            nom: existingTalent?.nom ?? null,
            phone: existingTalent?.phone ?? null,
          }
        : null,
    };
  });

  // Urgent (stage) rows first, then by recency within each bucket — the
  // `errors` query is already sorted by lastOccurredAt desc so a stable
  // sort by isStage preserves that.
  rows.sort((a, b) => Number(b.isStage) - Number(a.isStage));

  return { errors: rows };
};

export const actions: Actions = {
  resolve: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    requireFlag(locals, 'staff_sync_errors');
    const campusId = locals.staffProfile?.campusId;
    if (!campusId) return fail(400);

    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    // Scope: only resolve errors tied to an event of the current campus, so a
    // dev can't flip rows from a sibling campus by guessing IDs.
    const allowed = await campusEventExtIds(campusId);
    await prisma.syncError.updateMany({
      where: { id, eventExtId: { in: allowed } },
      data: { resolved: true, resolvedAt: new Date() },
    });

    return { success: true };
  },
};
