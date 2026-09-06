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
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
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
  // while this resolves, instead of the client navigation blocking on it. The
  // roster comes from `Participation` (Salesforce owns who is enrolled) and the
  // closings alongside it, joined by talent id: a closing keys on
  // (talent, event) rather than hanging off a participation row, so the sync
  // pruning an enrolment can no longer take a conducted closing with it. Same
  // shape the émargement screens already use. The status buckets, the
  // recommendation breakdown and the per-staff tally are all derived from rows
  // already in memory (a stage cohort is ~200).
  const cohort: Promise<ClosingsCohort> = (async () => {
    const [participations, closings, byStaff] = await Promise.all([
      db.participation.findMany({
        // Same cohort definition as every other dev screen. This was the one
        // roster built without it, which nothing could show while every
        // `sfMemberStatus` was null: as soon as the sync writes a status, a
        // withdrawn member would be listed for a closing here and absent from
        // the inscrits list of the same event.
        where: { eventId: event.id, ...visibleParticipationWhere },
        select: {
          talentId: true,
          talent: { select: { nom: true, prenom: true } },
        },
        orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      }),
      db.closing_Record.findMany({
        where: { eventId: event.id },
        select: {
          talentId: true,
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
      }),
      db.closing_Record.groupBy({
        by: ['staffId'],
        where: { eventId: event.id },
        _count: { staffId: true },
        orderBy: { _count: { staffId: 'desc' } },
        take: TOP_STAFF,
      }),
    ]);

    const closingOf = new Map(closings.map((c) => [c.talentId, c]));

    const rows: ClosingRow[] = participations.map((p) => {
      const closing = closingOf.get(p.talentId) ?? null;
      return {
        talentId: p.talentId,
        nom: p.talent.nom,
        prenom: p.talent.prenom,
        status: closingListStatus(closing),
        staffName: closing?.staff?.user?.name ?? null,
        staffImage: closing?.staff?.user?.image ?? null,
        conductedAt: closing?.conductedAt ?? null,
        recommendation: closing?.recommendation ?? null,
      };
    });

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
      const closing = closingOf.get(p.talentId) ?? null;
      counts[closingListStatus(closing)]++;
      if (closing?.status === 'done' && closing.recommendation) {
        recoCounts[closing.recommendation]++;
      }
    }

    // Resolve the grouped staff ids to display names (one extra query, only for
    // the handful that actually conducted a closing). The null bucket is dropped
    // rather than labelled: this card ranks who is conducting them, and closings
    // whose conductor has left the school are not a person to rank.
    const conducted = byStaff.filter(
      (g): g is typeof g & { staffId: string } => g.staffId !== null,
    );
    const staffIds = conducted.map((g) => g.staffId);
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
    const topStaff: StaffTally[] = conducted.map((g) => {
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
