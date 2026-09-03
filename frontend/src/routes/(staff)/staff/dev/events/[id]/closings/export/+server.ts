import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { resolveClosingGrids } from '$lib/server/closingTemplates';
import {
  buildClosingsSheet,
  closingsSheetSelect,
} from '$lib/server/services/closingsSheet';
import { asciiFilename, xlsxAttachment } from '$lib/server/attachments';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * One event's closings as an xlsx.
 *
 * The last dev surface without an export, which is what the dev team reported
 * after the stage. Whole-event by design and with no filter of its own: the
 * roster it lists is the one the closings page lists, so there is nothing on
 * screen for it to follow.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.CLOSINGS);

  // The module is only half the gate: without a grid there is nothing to ask,
  // so there is nothing to export either. Same 404 the roster page throws.
  if (!event.closingTemplateId) {
    throw error(
      404,
      "Aucune grille de closing n'est configurée pour cet événement.",
    );
  }

  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);

  const [roster, records] = await Promise.all([
    db.participation.findMany({
      // Same cohort definition as the roster page and as every other dev
      // screen, so the export and the list agree on who is enrolled.
      where: { eventId: event.id, ...visibleParticipationWhere },
      select: {
        talentId: true,
        talent: { select: { nom: true, prenom: true, externalId: true } },
      },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    db.closing_Record.findMany({
      where: { eventId: event.id },
      select: closingsSheetSelect,
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Every grid involved, resolved once each: the records of one event sit on one
  // grid in the ordinary case and on two when the event has been retargeted, and
  // the event's own grid is needed even when nothing has been conducted yet,
  // since it is what names the columns.
  const grids = await resolveClosingGrids([
    event.closingTemplateId,
    ...records.map((r) => r.templateId),
  ]);
  const currentGrid = grids.get(event.closingTemplateId);
  if (!currentGrid) throw error(404, 'Grille de closing introuvable.');

  const sheet = buildClosingsSheet({
    roster: roster.map((p) => ({
      talentId: p.talentId,
      prenom: p.talent.prenom,
      nom: p.talent.nom,
      externalId: p.talent.externalId,
    })),
    records,
    grids,
    currentGrid,
    timezone,
  });

  recordUsage(USAGE_FEATURES.DEV_CLOSINGS_EXPORT, {
    locals,
    eventId: event.id,
  });

  return xlsxAttachment(
    sheet,
    `Closings - ${asciiFilename(event.titre, 'closings')}.xlsx`,
  );
};
