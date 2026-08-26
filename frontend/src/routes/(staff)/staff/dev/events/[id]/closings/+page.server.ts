import { error } from '@sveltejs/kit';
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
import { resolveEventClosingIdentity } from '$lib/server/closingTemplates';
import { closingListStatus } from '$lib/domain/closing';
import type { ClosingRecommendation } from '@prisma/client';
import type {
  ClosingRow,
  StaffTally,
  ClosingsCohort,
} from './components/types';

const TOP_STAFF = 5;

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.CLOSINGS);

  // The module is only half the gate: without a grid there is nothing to ask, so
  // every "Mener le closing" link on this page would land on a 404. The nav entry
  // hides on the same condition (`hasClosingTemplate`), and a direct URL then
  // behaves like a missing page rather than dropping the dev on a roster whose
  // every row is a dead end. Exactly what `bilan` does without its form.
  //
  // The narrow resolver, not the graph one: this page reads a roster, never a
  // question, and only needs to know a grid resolves at all.
  const grid = await resolveEventClosingIdentity(event);
  if (!grid) {
    throw error(
      404,
      "Aucune grille de closing n'est configurée pour cet événement.",
    );
  }

  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);

  // Stream the cohort: the page shell (header + rail skeleton) paints immediately
  // while this resolves, instead of the client navigation blocking on it. One
  // driving query for the table (every participant left-joined with their
  // closing) plus a grouped count for the "closings menés" rail card; the
  // status buckets, the recommendation breakdown and the per-staff tally
  // are all derived from rows already in memory (a stage cohort is ~200).
  const cohort: Promise<ClosingsCohort> = (async () => {
    const [participations, byStaff] = await Promise.all([
      db.participation.findMany({
        where: { eventId: event.id },
        select: {
          id: true,
          talentId: true,
          talent: { select: { nom: true, prenom: true } },
          closing: {
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
      db.closing_Record.groupBy({
        by: ['staffId'],
        where: { participation: { eventId: event.id } },
        _count: { staffId: true },
        orderBy: { _count: { staffId: 'desc' } },
        take: TOP_STAFF,
      }),
    ]);

    const rows: ClosingRow[] = participations.map((p) => ({
      participationId: p.id,
      talentId: p.talentId,
      nom: p.talent.nom,
      prenom: p.talent.prenom,
      status: closingListStatus(p.closing),
      staffName: p.closing?.staff.user?.name ?? null,
      staffImage: p.closing?.staff.user?.image ?? null,
      conductedAt: p.closing?.conductedAt ?? null,
      recommendation: p.closing?.recommendation ?? null,
    }));

    // Status buckets (à faire / en cours / finalisé) for the synthesis card.
    const counts = { todo: 0, in_progress: 0, done: 0 };
    // Recommendation breakdown over finalised closings, for prospection.
    const recoCounts: Record<ClosingRecommendation, number> = {
      tres_compatible: 0,
      bon_profil: 0,
      indecis: 0,
      pas_interesse: 0,
    };
    for (const p of participations) {
      counts[closingListStatus(p.closing)]++;
      if (p.closing?.status === 'done' && p.closing.recommendation) {
        recoCounts[p.closing.recommendation]++;
      }
    }

    // Resolve the grouped staff ids to display names (one extra query, only for
    // the handful that actually conducted a closing).
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
    event: {
      id: event.id,
      titre: event.titre,
      publicName: event.publicName,
      cohortNoun: event.cohortNoun,
    },
    timezone,
    // Lets the leaderboard highlight the acting staff member's own row so they
    // can locate themselves at a glance, whatever their rank.
    currentStaffId: locals.staffProfile?.id ?? null,
    // Un-awaited on purpose: SvelteKit streams it so the shell paints first.
    cohort,
  };
};
