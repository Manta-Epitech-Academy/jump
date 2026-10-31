import type { PageServerLoad } from './$types';
import { EventService } from '$lib/server/services/events';
// The admin event view model is shared with the dashboard, so it lives on the
// service. Re-exported here so the cockpit page keeps importing it from its own
// route module.
export type { AdminEventVM } from '$lib/server/services/events';

// Read-only: an event's configuration is written over the admin API
// (`write_event_config`, `bulk_event_config`, `write_event_template`), which is
// where every capability of the former config wizard went (#483).
export const load: PageServerLoad = async () => ({
  events: await EventService.listAdminEvents(),
});
