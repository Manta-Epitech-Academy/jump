import type { RequestHandler } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { imageRightsStatus } from '$lib/domain/imageRights';
import { generateBadgesPDF } from '$lib/server/services/badgeGenerator';

// Generates the printable badge sheet for every talent registered to this event
// (no selection — all inscrits). Campus-scoped via the event load.
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');

  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    select: {
      talent: {
        select: { prenom: true, nom: true, imageRightsDecision: true },
      },
    },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const badges = participations.map((p) => ({
    prenom: p.talent.prenom,
    nom: p.talent.nom,
    imageRefused: imageRightsStatus(p.talent) === 'refused',
  }));

  const pdf = await generateBadgesPDF(badges);

  return new Response(
    new Blob([pdf as BlobPart], { type: 'application/pdf' }),
    {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="badges.pdf"',
      },
    },
  );
};
