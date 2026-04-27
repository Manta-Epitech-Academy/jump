import type { PageServerLoad } from './$types';
import { getCampusId } from '$lib/server/db/scoped';
import { requireFlag } from '$lib/server/auth/guards';
import { loadStageOr404 } from '$lib/server/services/stageContext';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireFlag(locals, 'stage_seconde');
  const campusId = getCampusId(locals);
  const event = await loadStageOr404(params.id, campusId);
  return { event };
};
