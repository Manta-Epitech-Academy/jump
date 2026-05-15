import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { EventService } from '$lib/server/services/events';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = scopedPrisma(getCampusId(locals));

  let event;
  try {
    event = await db.event.findUniqueOrThrow({
      where: { id: params.id },
      select: {
        id: true,
        titre: true,
        mantas: { select: { staffProfileId: true } },
      },
    });
  } catch {
    throw error(404, 'Événement introuvable');
  }

  const assignedIds = new Set(event.mantas.map((m) => m.staffProfileId));

  // One query for both sides — include any staff with peda/manta role on the
  // campus, plus anyone already assigned to this event (in case their role
  // was changed after assignment).
  const allStaff = await db.staffProfile.findMany({
    where: {
      OR: [
        { staffRole: { in: ['peda', 'manta'] } },
        { id: { in: [...assignedIds] } },
      ],
    },
    select: {
      id: true,
      staffRole: true,
      user: { select: { name: true, email: true, image: true } },
      _count: { select: { eventMantas: true } },
    },
  });

  const roleRank = (r: string | null) =>
    r === 'peda' ? 0 : r === 'manta' ? 1 : 2;
  allStaff.sort((a, b) => {
    const r = roleRank(a.staffRole) - roleRank(b.staffRole);
    if (r !== 0) return r;
    return (a.user?.name ?? '').localeCompare(b.user?.name ?? '', 'fr');
  });

  const assigned = allStaff.filter((s) => assignedIds.has(s.id));
  const available = allStaff.filter((s) => !assignedIds.has(s.id));

  return {
    event: { id: event.id, titre: event.titre },
    assigned,
    available,
  };
};

export const actions: Actions = {
  add: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const formData = await request.formData();
    const staffProfileId = (formData.get('staffProfileId') ?? '')
      .toString()
      .trim();
    if (!staffProfileId) return fail(400, { message: 'Identifiant manquant' });

    try {
      await EventService.addEventStaff(
        params.id,
        getCampusId(locals),
        staffProfileId,
      );
    } catch (e: unknown) {
      const status =
        e &&
        typeof e === 'object' &&
        'status' in e &&
        typeof e.status === 'number'
          ? e.status
          : 500;
      const message =
        e && typeof e === 'object' && 'body' in e && e.body
          ? String(
              (e.body as { message?: string }).message ?? 'Action impossible',
            )
          : 'Action impossible';
      return fail(status, { message });
    }

    return { success: true };
  },

  remove: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const formData = await request.formData();
    const staffProfileId = (formData.get('staffProfileId') ?? '')
      .toString()
      .trim();
    if (!staffProfileId) return fail(400, { message: 'Identifiant manquant' });

    try {
      await EventService.removeEventStaff(
        params.id,
        getCampusId(locals),
        staffProfileId,
      );
    } catch (e: unknown) {
      const status =
        e &&
        typeof e === 'object' &&
        'status' in e &&
        typeof e.status === 'number'
          ? e.status
          : 500;
      const message =
        e && typeof e === 'object' && 'body' in e && e.body
          ? String(
              (e.body as { message?: string }).message ?? 'Action impossible',
            )
          : 'Action impossible';
      return fail(status, { message });
    }

    return { success: true };
  },
};
