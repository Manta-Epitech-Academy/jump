import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { interviewListStatus } from '$lib/domain/interview';
import type { InterviewRecommendation } from '@prisma/client';
import type {
  EntretienRow,
  StaffTally,
  EntretiensCohort,
} from './components/types';

const TOP_STAFF = 5;

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.ENTRETIENS);
  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);

  // Stream the cohort: the page shell (header + rail skeleton) paints immediately
  // while this resolves, instead of the client navigation blocking on it. One
  // driving query for the table (every participant left-joined with their
  // interview) plus a grouped count for the "entretiens menés" rail card; the
  // status buckets, the recommendation breakdown and the per-staff tally
  // are all derived from rows already in memory (a stage cohort is ~200).
  const cohort: Promise<EntretiensCohort> = (async () => {
    const [participations, byStaff] = await Promise.all([
      db.participation.findMany({
        where: { eventId: event.id },
        select: {
          id: true,
          talentId: true,
          talent: { select: { nom: true, prenom: true } },
          interview: {
            select: {
              status: true,
              conductedAt: true,
              recommendation: true,
              staff: {
                select: {
                  id: true,
                  user: { select: { name: true, image: true } },
                },
              },
            },
          },
        },
        orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      }),
      db.interview.groupBy({
        by: ['staffId'],
        where: { participation: { eventId: event.id } },
        _count: { staffId: true },
        orderBy: { _count: { staffId: 'desc' } },
        take: TOP_STAFF,
      }),
    ]);

    const rows: EntretienRow[] = participations.map((p) => ({
      participationId: p.id,
      talentId: p.talentId,
      nom: p.talent.nom,
      prenom: p.talent.prenom,
      status: interviewListStatus(p.interview),
      staffName: p.interview?.staff.user?.name ?? null,
      staffImage: p.interview?.staff.user?.image ?? null,
      conductedAt: p.interview?.conductedAt ?? null,
      recommendation: p.interview?.recommendation ?? null,
    }));

    // Status buckets (à faire / en cours / finalisé) for the synthesis card.
    const counts = { todo: 0, in_progress: 0, done: 0 };
    // Recommendation breakdown over finalized interviews, for prospection.
    const recoCounts: Record<InterviewRecommendation, number> = {
      tres_compatible: 0,
      bon_profil: 0,
      indecis: 0,
      pas_interesse: 0,
    };
    for (const p of participations) {
      counts[interviewListStatus(p.interview)]++;
      if (p.interview?.status === 'done' && p.interview.recommendation) {
        recoCounts[p.interview.recommendation]++;
      }
    }

    // Resolve the grouped staff ids to display names (one extra query, only for
    // the handful that actually conducted an interview).
    const staffIds = byStaff.map((g) => g.staffId);
    const staff = staffIds.length
      ? await db.staffProfile.findMany({
          where: { id: { in: staffIds } },
          select: {
            id: true,
            user: { select: { name: true, email: true, image: true } },
          },
        })
      : [];
    const staffById = new Map(staff.map((s) => [s.id, s]));
    const topStaff: StaffTally[] = byStaff.map((g) => {
      const u = staffById.get(g.staffId)?.user;
      return {
        id: g.staffId,
        name: u?.name ?? u?.email ?? 'Staff',
        image: u?.image ?? null,
        count: g._count.staffId,
      };
    });

    return { rows, counts, recoCounts, topStaff, total: rows.length };
  })();

  return {
    event: { id: event.id, titre: event.titre, publicName: event.publicName },
    timezone,
    // Lets the leaderboard highlight the acting staff member's own row so they
    // can locate themselves at a glance, whatever their rank.
    currentStaffId: locals.staffProfile?.id ?? null,
    // Un-awaited on purpose: SvelteKit streams it so the shell paints first.
    cohort,
  };
};
