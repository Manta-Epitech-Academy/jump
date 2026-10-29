import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { resolveEventClosingIdentity } from '$lib/server/closingTemplates';
import { loadClosingsRoster } from '$lib/server/services/closingsRoster';
import type { StaffTally, ClosingsCohort } from './components/types';

const TOP_STAFF = 5;

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.CLOSINGS,
  );

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
  // while this resolves, instead of the client navigation blocking on it.
  const cohort: Promise<ClosingsCohort> = (async () => {
    const [roster, byStaff] = await Promise.all([
      loadClosingsRoster(db, event.id),
      db.closing_Record.groupBy({
        by: ['staffId'],
        where: { eventId: event.id },
        _count: { staffId: true },
        orderBy: { _count: { staffId: 'desc' } },
        take: TOP_STAFF,
      }),
    ]);

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

    return { ...roster, topStaff };
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
