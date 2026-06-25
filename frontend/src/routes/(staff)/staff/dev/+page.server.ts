import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';
import {
  firstEnabledModule,
  EVENT_MODULE_DEFS,
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

  if (current) {
    const first = firstEnabledModule(current.modules);
    if (first) {
      throw redirect(
        303,
        resolvePath(
          `/staff/dev/events/${current.id}/${EVENT_MODULE_DEFS[first].segment}`,
        ),
      );
    }
    throw redirect(303, resolvePath(`/staff/dev/events/${current.id}`));
  }

  return {
    userName: locals.user.name || 'Utilisateur',
    campusName: locals.staffProfile?.campus?.name || 'votre campus',
  };
};
