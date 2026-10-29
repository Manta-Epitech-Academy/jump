import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getCampusId } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { resolvePublishedEventForm } from '$lib/server/feedbackForms';
import { asciiFilename, buildXlsx, xlsxResponse } from '$lib/server/xlsx';
import { feedbackSheet } from '$lib/server/services/eventSheets';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Event-scoped XLSX of the feedback responses, the dev-space counterpart of the
// QR. Resolves the event's form exactly like the page (override else type
// default, published + authenticated) so the export never reports a form the
// page wouldn't show, and lists the answers of the cohort the page lists
// (`feedbackSheet`). The route is dev-space + `bilan`-module gated.
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId, EVENT_MODULES.BILAN);

  const graph = await resolvePublishedEventForm(event);
  if (!graph) {
    throw error(404, 'Aucun formulaire de feedback.');
  }

  const sheet = await feedbackSheet(event, graph);

  recordUsage(USAGE_FEATURES.DEV_BILAN_EXPORT, { locals, eventId: params.id });

  // Named by the form title (whatever form the event uses) and the event
  // title, so the download names itself per attached form.
  return xlsxResponse(
    buildXlsx(sheet),
    `${asciiFilename(graph.title, 'Feedback')} - ${asciiFilename(event.titre, 'evenement')}`,
  );
};
