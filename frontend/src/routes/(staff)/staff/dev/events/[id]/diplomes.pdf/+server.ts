import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  loadEventOr404,
  requireEventModule,
  eventEndOrDefault,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { generateDiplomasPDF } from '$lib/server/services/diplomaGenerator';
import { resolveEventDiplomaDesign } from '$lib/server/diplomaTemplates';
import { getStorage, isObjectNotFound } from '$lib/server/infra/storage';
import { prisma } from '$lib/server/db';
import { formatDateFr } from '$lib/utils';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Generates whichever certificate this event issues, for every talent registered
// to it (no selection, all inscrits), one page per student. Campus-scoped via
// the event load. Signatories are the global ones plus this campus's local ones;
// their signature images are fetched from S3 and inlined as base64 data URIs,
// which is also what lets the renderer print with the network blocked.
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');

  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  // Two gates, answering two different questions. The module guards access to
  // the COHORT: this export prints every inscrit, so a direct GET must not leak
  // it when Inscrits is off (same reason as badges.pdf). The template answers
  // whether this event issues a document at all.
  requireEventModule(event, EVENT_MODULES.INSCRITS);
  const design = await resolveEventDiplomaDesign(event);
  if (!design) {
    throw error(404, 'Fonctionnalité non disponible pour cet événement.');
  }
  const db = scopedPrisma(campusId);

  const [participations, campus, signatoryRows] = await Promise.all([
    db.participation.findMany({
      where: { eventId: event.id },
      select: { talent: { select: { prenom: true, nom: true } } },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    prisma.campus.findUnique({
      where: { id: campusId },
      select: { name: true, timezone: true },
    }),
    prisma.signatory.findMany({
      where: { OR: [{ campusId: null }, { campusId }] },
      // `position` is the single ordering knob the admin sets ("plus petit =
      // affiché en premier"). Order by it alone so a global signatory and a
      // campus-local one interleave by position; sorting by `campusId` first
      // would pin globals after locals (NULLS LAST) and make `position`
      // unable to move a signatory across that boundary.
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { name: true, role: true, signatureKey: true, contentType: true },
    }),
  ]);

  const storage = getStorage();
  const signatories = await Promise.all(
    signatoryRows.map(async (s) => {
      // A missing signature image must not 500 the whole sheet: render the block
      // with the name and role over a blank signature line. This is the normal
      // case for a DB restored without its S3 objects, and guards against a real
      // signatory whose image was deleted. A genuine storage incident (timeout,
      // 5xx) still throws, so we never silently ship a diploma missing a present
      // signature.
      let imageDataUri: string | null = null;
      try {
        const bytes = await storage.get(s.signatureKey);
        imageDataUri = `data:${s.contentType};base64,${bytes.toString('base64')}`;
      } catch (err) {
        if (!isObjectNotFound(err)) throw err;
        console.warn(
          `Diploma: signature image absent for "${s.name}" (${s.signatureKey}); rendering without it.`,
        );
      }
      return { name: s.name, role: s.role, imageDataUri };
    }),
  );

  const timezone = campus?.timezone;
  const pdf = await generateDiplomasPDF(design, {
    students: participations.map((p) => ({
      prenom: p.talent.prenom,
      nom: p.talent.nom,
    })),
    city: campus?.name ?? '',
    startDate: formatDateFr(event.date, timezone),
    endDate: formatDateFr(eventEndOrDefault(event), timezone),
    todayDate: formatDateFr(new Date(), timezone),
    signatories,
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
