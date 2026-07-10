import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
  if (!locals.user) {
    throw error(401, 'Non autorisé');
  }

  const { workspace } = await parent();

  // Get the selected year from query parameters, defaulting to the current/default event's school year
  const defaultYear = workspace.current?.schoolYear.label ?? '';
  const selectedYear = url.searchParams.get('year') || defaultYear;

  // Filter events of the selected year and sort them chronologically (oldest first)
  const yearEvents = workspace.events
    .filter((e) => e.schoolYear.label === selectedYear)
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    selectedYear,
    events: yearEvents,
  };
};
