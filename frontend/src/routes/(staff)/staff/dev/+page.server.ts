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
  // Workspace membership requires at least one enabled module (see
  // `resolveWorkspaceEvents`), so a non-null `current` always has a first surface
  // to land on. The empty state below only shows when the campus has no activated
  // event exposing any surface (no per-event "home" exists anymore to fall back to).
  const first = current ? firstEnabledModule(current.modules) : null;
  if (current && first) {
    throw redirect(
      303,
      resolvePath(
        `/staff/dev/events/${current.id}/${EVENT_MODULE_DEFS[first].segment}`,
      ),
    );
  }

  return {
    userName: locals.user.name || 'Utilisateur',
    campusName: locals.staffProfile?.campus?.name || 'votre campus',
  };
};
