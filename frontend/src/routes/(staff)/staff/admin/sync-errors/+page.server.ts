import type { PageServerLoad } from './$types';
import { loadOpenSyncErrors } from '$lib/server/services/syncErrorQueue';

// Read-only: the sync opens and closes these errors, nobody resolves one here.
// Streamed, because naming who holds each address reads every talent's
// addresses, so the header paints before the queue lands.
export const load: PageServerLoad = () => ({
  queue: loadOpenSyncErrors(),
});
