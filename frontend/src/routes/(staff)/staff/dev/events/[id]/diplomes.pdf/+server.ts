import type { RequestHandler } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  loadEventOr404,
  stageEndOrDefault,
} from '$lib/server/services/stageContext';
import { generateStageDiplomasPDF } from '$lib/server/services/diplomaGenerator';
import { getStorage, isObjectNotFound } from '$lib/server/infra/storage';
import { prisma } from '$lib/server/db';
import { formatDateFr } from '$lib/utils';

// Generates the internship certificate sheet for every talent registered to
// this event (no selection — all inscrits), one A4 landscape page per student.
// Campus-scoped via the event load. Signatories are the global ones plus this
// campus's local ones; their signature images are fetched from S3 and inlined
// as base64 data URIs so the PDF template needs no network access.
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');

  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
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
  const pdf = await generateStageDiplomasPDF({
    students: participations.map((p) => ({
      prenom: p.talent.prenom,
      nom: p.talent.nom,
    })),
    city: campus?.name ?? '',
    startDate: formatDateFr(event.date, timezone),
    endDate: formatDateFr(stageEndOrDefault(event), timezone),
    todayDate: formatDateFr(new Date(), timezone),
    signatories,
  });

  return new Response(
    new Blob([pdf as BlobPart], { type: 'application/pdf' }),
    {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="diplomes.pdf"',
        // Regenerated from live DB each call (signatory role/image can change).
        // Without this the browser HTTP-caches the stable .pdf URL and re-serves
        // a stale diploma. Mirrors onboarding-pdfs / interview-pdfs exports.
        'Cache-Control': 'no-store',
      },
    },
  );
};
