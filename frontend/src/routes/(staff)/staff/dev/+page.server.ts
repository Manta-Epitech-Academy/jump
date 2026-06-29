import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';
import {
  firstReachableSurface,
  surfaceSegment,
} from '$lib/domain/eventModules';

/**
 * The dev space has no standalone dashboard: it drops straight onto the current
 * event's first enabled surface. When the campus has no configured event yet,
 * it shows a short empty state.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
  if (!locals.user) {
    throw error(401, 'Authentification requise');
  }

  const { workspace } = await parent();
  const current = workspace.current;
  // Land on the event's first reachable surface. "Reachable" folds the module set
  // with the data gates (planning needs a schedule, bilan needs a live form), so
  // this never redirects to a surface that would 404 the way routing off the raw
  // module set did. Null (no reachable surface) falls through to the empty state.
  const first = current ? firstReachableSurface(current) : null;
  if (current && first) {
    throw redirect(
      303,
      resolvePath(`/staff/dev/events/${current.id}/${surfaceSegment(first)}`),
    );
  }

  return {
    userName: locals.user.name || 'Utilisateur',
    campusName: locals.staffProfile?.campus?.name || 'votre campus',
  };
};
