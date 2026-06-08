import type { RequestHandler } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { niveauLabel } from '$lib/domain/niveau';
import {
  rulesStatus,
  dossierReadiness,
  DOSSIER_READINESS_LABELS,
} from '$lib/domain/stageCompliance';
import { imageRightsStatus } from '$lib/domain/imageRights';
import { buildXlsx } from '$lib/server/xlsx';
import { INSCRIT_PARTICIPATION_SELECT } from '../components/types';

/**
 * Filtered-cohort XLSX export. The inscrits page filters/sorts ~200 rows client
 * side, so it POSTs the talent ids it is currently showing (in display order);
 * the server re-queries them campus + event scoped and recomputes readiness from
 * the DB (never trusting the client for the verdict), then streams the workbook.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  const body = (await request.json().catch(() => null)) as {
    talentIds?: unknown;
  } | null;
  const talentIds = Array.isArray(body?.talentIds)
    ? body.talentIds.filter((x): x is string => typeof x === 'string')
    : [];

  const participations = talentIds.length
    ? await db.participation.findMany({
        where: { eventId: event.id, talentId: { in: talentIds } },
        select: INSCRIT_PARTICIPATION_SELECT,
      })
    : [];

  // Preserve the client's filtered + sorted order.
  const byTalent = new Map(participations.map((p) => [p.talentId, p]));
  const ordered = talentIds
    .map((id) => byTalent.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const rows = ordered.map((p) => {
    const t = p.talent;
    const readiness = dossierReadiness(
      rulesStatus(
        t.parentRulesSignedAt,
        p.stageCompliance?.charteSigned,
        t.rulesSignedAt,
      ),
      imageRightsStatus(t),
    );
    return [
      t.prenom,
      t.nom,
      t.school?.name ?? '',
      t.niveau ? niveauLabel(t.niveau) : '',
      DOSSIER_READINESS_LABELS[readiness],
      t.email ?? '',
      t.parentEmail ?? '',
    ];
  });

  const xlsx = buildXlsx({
    name: 'Inscrits',
    headers: [
      'Prénom',
      'Nom',
      'Lycée',
      'Niveau',
      'Statut',
      'Email élève',
      'Email parent',
    ],
    rows,
    colWidths: [18, 18, 32, 16, 12, 28, 28],
  });

  // ASCII-safe filename for the Content-Disposition header (the client sets its
  // own accented download name; this is just the fallback).
  const safeTitle =
    event.titre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim() || 'inscrits';

  // `buildXlsx` returns an exactly-sized Uint8Array, so its backing buffer is
  // the whole payload. Hand the ArrayBuffer to Response (BodyInit) directly.
  return new Response(xlsx.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Inscrits - ${safeTitle}.xlsx"`,
    },
  });
};
