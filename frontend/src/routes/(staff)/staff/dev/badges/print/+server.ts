import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { resolveStageContext } from '$lib/server/services/stageContext';
import { imageRightsStatus } from '$lib/domain/imageRights';
import { generateBadgesPDF } from '$lib/server/services/badgeGenerator';

export const POST: RequestHandler = async ({ request, locals }) => {
  requireStaffGroup(locals, 'devMember');

  const db = scopedPrisma(getCampusId(locals));
  const stage = await resolveStageContext(db, {
    phaseOverride: locals.stagePhaseOverride,
  });
  if (!stage) {
    throw error(404, 'Aucun stage de seconde actif.');
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: unknown;
  } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string')
    : [];
  if (ids.length === 0) {
    throw error(400, 'Aucun badge sélectionné.');
  }

  // Re-resolve the talents server-side from the active stage participations so a
  // forged id can't pull a talent outside this campus/stage onto a badge.
  const participations = await db.participation.findMany({
    where: { eventId: stage.id, talentId: { in: ids } },
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
        'Content-Disposition': 'attachment; filename="badges-stage.pdf"',
      },
    },
  );
};
