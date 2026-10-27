import type { RequestHandler } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { niveauLabel } from '$lib/domain/niveau';
import { civiliteLabel } from '$lib/domain/profile';
import { parcoursLabel } from '$lib/domain/enrolmentHistory';
import {
  INSCRIT_STATUS_LABELS,
  RULES_STATUS_LABELS,
} from '$lib/domain/dossierCompliance';
import {
  imageRightsDisplayStatus,
  IMAGE_RIGHTS_DISPLAY_LABELS,
} from '$lib/domain/imageRights';
import { buildXlsx } from '$lib/server/xlsx';
import { loadInscritsCohort } from '../rows';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * Filtered-cohort XLSX export. The inscrits page filters/sorts ~200 rows client
 * side, so it POSTs the talent ids it is currently showing (in display order);
 * the server rebuilds those rows with the page's own loader (`../rows.ts`),
 * campus + event scoped and recomputed from the DB (never trusting the client),
 * then streams the workbook.
 *
 * The sheet is richer than the on-screen table on purpose: a download is where
 * the dev actually works the cohort: it adds student + parent phone/email and
 * splits the folded "Statut" into its two gates (règlement, droit à l'image) so
 * the file doubles as a contact list and a "who owes what" triage sheet. The
 * contacts are read here only, so they never travel in the page's payload.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.INSCRITS,
  );
  const db = scopedPrisma(campusId);

  const body = (await request.json().catch(() => null)) as {
    talentIds?: unknown;
  } | null;
  const talentIds = Array.isArray(body?.talentIds)
    ? body.talentIds.filter((x): x is string => typeof x === 'string')
    : [];

  const [cohort, contacts] = await Promise.all([
    loadInscritsCohort(db, event, getCampusTimezone(locals), { talentIds }),
    talentIds.length
      ? db.participation.findMany({
          where: {
            eventId: event.id,
            talentId: { in: talentIds },
            ...visibleParticipationWhere,
          },
          select: {
            talentId: true,
            talent: {
              select: {
                phone: true,
                parentPrenom: true,
                parentNom: true,
                parentEmail: true,
                parentPhone: true,
              },
            },
          },
        })
      : [],
  ]);
  const contactOf = new Map(contacts.map((c) => [c.talentId, c.talent]));

  // Preserve the client's filtered + sorted order.
  const byTalent = new Map(cohort.rows.map((r) => [r.talentId, r]));
  const ordered = talentIds
    .map((id) => byTalent.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r);

  const rows = ordered.map((r) => {
    const contact = contactOf.get(r.talentId);
    const parentName = [contact?.parentPrenom, contact?.parentNom]
      .filter(Boolean)
      .join(' ');
    return [
      civiliteLabel(r.civilite),
      r.prenom,
      r.nom,
      r.xp,
      parcoursLabel(r.priorEnrolments),
      r.techInterests.map((i) => i.nom).join(', '),
      r.schoolName ?? '',
      r.niveau ? niveauLabel(r.niveau) : '',
      INSCRIT_STATUS_LABELS[r.status],
      r.connected ? 'Oui' : 'Non',
      RULES_STATUS_LABELS[r.rulesStatus],
      IMAGE_RIGHTS_DISPLAY_LABELS[
        imageRightsDisplayStatus(r.imageStatus, r.studentSigned)
      ],
      r.email ?? '',
      contact?.phone ?? '',
      parentName,
      contact?.parentEmail ?? '',
      contact?.parentPhone ?? '',
    ];
  });

  const xlsx = buildXlsx({
    name: 'Inscrits',
    headers: [
      'Genre',
      'Prénom',
      'Nom',
      'XP',
      'Parcours',
      'Intérêts tech',
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
    colWidths: [
      8, 16, 16, 8, 22, 26, 30, 10, 12, 11, 18, 16, 26, 16, 22, 26, 16,
    ],
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
