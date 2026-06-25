import type { PageServerLoad } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  isEventModuleKey,
  type EventModuleKey,
} from '$lib/domain/eventModules';

/**
 * Dev-lead surface to configure ANY imported event of the campus, whatever its
 * Salesforce type. The SF type only seeds an event's initial modules at import;
 * from here a lead opens any event and toggles its modules, which is what makes
 * it appear (or not) in the workspace switcher. This is the seam that keeps Jump
 * in control of the workspace rather than the imported type.
 */
export const load: PageServerLoad = async ({ locals }) => {
  requireStaffGroup(locals, 'devLead');
  const db = scopedPrisma(getCampusId(locals));

  const rows = await db.event.findMany({
    orderBy: { date: 'desc' },
    select: {
      id: true,
      titre: true,
      eventType: true,
      date: true,
      endDate: true,
      modules: { select: { moduleKey: true } },
      _count: { select: { participations: true } },
    },
  });

  const events = rows.map((e) => ({
    id: e.id,
    titre: e.titre,
    eventType: e.eventType,
    date: e.date,
    endDate: e.endDate,
    participations: e._count.participations,
    modules: e.modules
      .map((m) => m.moduleKey)
      .filter(isEventModuleKey) as EventModuleKey[],
  }));

  return { events };
};
