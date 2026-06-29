import type { RequestHandler } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { imageRightsStatus } from '$lib/domain/imageRights';
import { generateBadgesPDF } from '$lib/server/services/badgeGenerator';

// Generates the printable badge sheet for every talent registered to this event
// (no selection — all inscrits). Campus-scoped via the event load. The `mode`
// query param picks the simple or foldable layout.
export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireStaffGroup(locals, 'devMember');

  const mode =
    url.searchParams.get('mode') === 'foldable' ? 'foldable' : 'simple';

  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  // The badge sheet is part of the Inscrits surface (it prints the cohort), so
  // it is gated on the same module as the page and `diplomes.pdf`: a direct GET
  // must not leak the cohort when Inscrits is disabled for the event.
  requireEventModule(event, EVENT_MODULES.INSCRITS);
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

  const pdf = await generateBadgesPDF(badges, mode);

  return new Response(
    new Blob([pdf as BlobPart], { type: 'application/pdf' }),
    {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="badges.pdf"',
        // Regenerated from live DB each call; never serve a cached copy.
        'Cache-Control': 'no-store',
      },
    },
  );
};
