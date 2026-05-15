import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireStaffGroup(locals, 'pedaMember');

  const event = await loadEventOr404(params.id, getCampusId(locals));

  // List inscribed talents joined with their pending / observed observable
  // counts for this event. Two grouped queries are cheaper than a single
  // include with filtered _count, and easier to keep in sync if we add new
  // observable states later.
  const [participations, pendingCounts, observedCounts] = await Promise.all([
    prisma.participation.findMany({
      where: { eventId: event.id },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      select: {
        id: true,
        isPresent: true,
        talent: {
          select: { id: true, prenom: true, nom: true },
        },
      },
    }),
    prisma.talentObservableState.groupBy({
      by: ['talentId'],
      where: { eventId: event.id, state: 'pending' },
      _count: { _all: true },
    }),
    prisma.talentObservableState.groupBy({
      by: ['talentId'],
      where: { eventId: event.id, state: 'observed' },
      _count: { _all: true },
    }),
  ]);

  const pendingByTalent = new Map(
    pendingCounts.map((row) => [row.talentId, row._count._all]),
  );
  const observedByTalent = new Map(
    observedCounts.map((row) => [row.talentId, row._count._all]),
  );

  const rows = participations.map((p) => ({
    talentId: p.talent.id,
    prenom: p.talent.prenom,
    nom: p.talent.nom,
    isPresent: p.isPresent,
    pendingCount: pendingByTalent.get(p.talent.id) ?? 0,
    observedCount: observedByTalent.get(p.talent.id) ?? 0,
  }));

  return { event, rows };
};
