import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { generateDiplomasPDF } from '$lib/server/services/diplomaGenerator';
import {
  loadEventCertificateContext,
  resolveEventDiplomaDesign,
} from '$lib/server/diplomaTemplates';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Generates whichever certificate this event issues, for every talent registered
// to it (no selection, all inscrits), one page per student. Campus-scoped via
// the event load; what the page prints besides the names is
// `loadEventCertificateContext`, which the event's preview reads too.
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');

  const campusId = getCampusId(locals);
  // Two gates, answering two different questions. The module guards access to
  // the COHORT: this export prints every inscrit, so a direct GET must not leak
  // it when Inscrits is off (same reason as badges.pdf). The template answers
  // whether this event issues a document at all.
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.INSCRITS,
  );
  const design = await resolveEventDiplomaDesign(event);
  if (!design) {
    throw error(404, 'Fonctionnalité non disponible pour cet événement.');
  }
  const db = scopedPrisma(campusId);

  const [participations, context] = await Promise.all([
    db.participation.findMany({
      where: { eventId: event.id, ...visibleParticipationWhere },
      select: { talent: { select: { prenom: true, nom: true } } },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    loadEventCertificateContext(event, campusId),
  ]);

  const pdf = await generateDiplomasPDF(design, {
    ...context,
    students: participations.map((p) => ({
      prenom: p.talent.prenom,
      nom: p.talent.nom,
    })),
  });

  recordUsage(USAGE_FEATURES.DEV_DIPLOMAS_RENDER, {
    locals,
    eventId: params.id,
  });

  return new Response(
    new Blob([pdf as BlobPart], { type: 'application/pdf' }),
    {
      headers: {
        'Content-Type': 'application/pdf',
        // Named for the document actually issued; the browser overrides it with
        // the friendly name the Inscrits page sets on the download anchor.
        'Content-Disposition': `attachment; filename="${design.code}.pdf"`,
        // Regenerated from live DB each call (signatory role/image can change).
        // Without this the browser HTTP-caches the stable .pdf URL and re-serves
        // a stale diploma. Mirrors onboarding-pdfs / closing-pdfs exports.
        'Cache-Control': 'no-store',
      },
    },
  );
};
