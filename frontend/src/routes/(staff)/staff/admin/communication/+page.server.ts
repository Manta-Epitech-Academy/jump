import type { PageServerLoad } from './$types';
import { getCommunicationOverview } from '$lib/server/services/communicationStats';

export const load: PageServerLoad = async () => getCommunicationOverview();
