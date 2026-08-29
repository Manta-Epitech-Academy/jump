import type { RequestHandler } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { niveauLabel } from '$lib/domain/niveau';
import {
  rulesStatus,
  inscritStatus,
  INSCRIT_STATUS_LABELS,
  RULES_STATUS_LABELS,
} from '$lib/domain/dossierCompliance';
import {
  imageRightsStatus,
  imageRightsDisplayStatus,
  IMAGE_RIGHTS_DISPLAY_LABELS,
} from '$lib/domain/imageRights';
import { buildXlsx } from '$lib/server/xlsx';
import { INSCRIT_EXPORT_PARTICIPATION_SELECT } from '../components/types';
import { loadEventDossierSignatures, NO_DOSSIER_SIGNATURES } from '../dossiers';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * Filtered-cohort XLSX export. The inscrits page filters/sorts ~200 rows client
 * side, so it POSTs the talent ids it is currently showing (in display order);
 * the server re-queries them campus + event scoped and recomputes the dossier
 * verdicts from the DB (never trusting the client), then streams the workbook.
 *
 * The sheet is richer than the on-screen table on purpose: a download is where
 * the dev actually works the cohort: it adds student + parent phone/email and
 * splits the folded "Statut" into its two gates (règlement, droit à l'image) so
 * the file doubles as a contact list and a "who owes what" triage sheet.
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

  // Same dossier the on-screen column reads: the event's own school year, never
  // the talent's most recent one.
  const eventSchoolYear = schoolYearOf(
    event.date,
    getCampusTimezone(locals),
  ).label;

  const [participations, dossiers] = await Promise.all([
    talentIds.length
      ? db.participation.findMany({
          where: { eventId: event.id, talentId: { in: talentIds } },
          select: INSCRIT_EXPORT_PARTICIPATION_SELECT,
        })
      : [],
    loadEventDossierSignatures(db, event.id, eventSchoolYear),
  ]);

  // Preserve the client's filtered + sorted order.
  const byTalent = new Map(participations.map((p) => [p.talentId, p]));
  const ordered = talentIds
    .map((id) => byTalent.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const rows = ordered.map((p) => {
    const t = p.talent;
    // Recompute the verdict server-side (never trust the client): the folded
    // "Statut" mirrors the table badge, and connection + each gate get their own
    // column so the sheet can be triaged on what a student actually owes.
    const dossier = dossiers.get(p.talentId) ?? NO_DOSSIER_SIGNATURES;
    const rules = rulesStatus(
      dossier.parentRulesSignedAt,
      dossier.rulesSignedAt,
    );
    // Off the event's own dossier, like the règlement above it.
    const image = imageRightsStatus(dossier);
    const connected = t.firstLoginAt != null;
    const status = inscritStatus(t.niveau, connected, rules, image);
    const parentName = [t.parentPrenom, t.parentNom].filter(Boolean).join(' ');
    return [
      t.prenom,
      t.nom,
      t.school?.name ?? '',
      t.niveau ? niveauLabel(t.niveau) : '',
      INSCRIT_STATUS_LABELS[status],
      connected ? 'Oui' : 'Non',
      RULES_STATUS_LABELS[rules],
      IMAGE_RIGHTS_DISPLAY_LABELS[
        imageRightsDisplayStatus(image, dossier.rulesSignedAt != null)
      ],
      t.user?.email ?? '',
      t.phone ?? '',
      parentName,
      t.parentEmail ?? '',
      t.parentPhone ?? '',
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
      'Connexion',
      'Règlement intérieur',
      "Droit à l'image",
      'Email élève',
      'Téléphone élève',
      'Parent',
      'Email parent',
      'Téléphone parent',
    ],
    rows,
    colWidths: [16, 16, 30, 10, 12, 11, 18, 16, 26, 16, 22, 26, 16],
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
  recordUsage(USAGE_FEATURES.DEV_INSCRITS_EXPORT, {
    locals,
    eventId: params.id,
  });

  return new Response(xlsx.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Inscrits - ${safeTitle}.xlsx"`,
    },
  });
};
