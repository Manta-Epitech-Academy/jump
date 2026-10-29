import type { PageServerLoad } from './$types';
import { WorkshopCatalogueService } from '$lib/server/services/workshopCatalogue';

// The subject catalogue is the same for every campus, so the load takes nothing
// from the session beyond the dev-space guard the layout already applied. The
// domain filter lives in the URL and is applied on the page: the load never
// reads it, so changing it does not run the query again.
export const load: PageServerLoad = async () => ({
  subjects: await WorkshopCatalogueService.listShown(),
});
