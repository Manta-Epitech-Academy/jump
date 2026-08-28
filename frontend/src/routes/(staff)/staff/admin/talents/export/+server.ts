import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { buildXlsx } from '$lib/server/xlsx';
import { niveauLabel } from '$lib/domain/niveau';
import { civiliteLabel } from '$lib/domain/profile';
import {
  imageRightsStatus,
  IMAGE_RIGHTS_STATUS_LABELS,
} from '$lib/domain/imageRights';
import {
  parseTalentFilters,
  buildTalentWhere,
  buildOrderBy,
  TALENT_ROW_SELECT,
  projectTalentRow,
} from '../query';
import { TALENT_STATUS_LABELS, PARENT_STATUS_LABELS } from '../labels';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * Filtered-directory XLSX export. Unlike the dev inscrits export (which posts
 * the ~200 ids it holds client-side), the admin talents list is server
 * paginated — only the current page of 50 is ever in the browser — so this
 * endpoint re-derives the filter `where` from the URL params via the shared
 * builder and exports EVERY matching row, in the table's sort order. The shared
 * `projectTalentRow` is what guarantees the "Statut" / "Parent" columns read the
 * same verdict as the on-screen badges.
 *
 * The sheet is richer than the table on purpose: it adds student + parent
 * phone/email, the onboarding step, the image-rights decision and activity, so
 * the download doubles as a contact list and a "who owes what" triage sheet.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_TALENTS_EXPORT, { locals });
  // Belt-and-braces: /staff/admin/* is already gated in hooks, but assert here
  // too since an endpoint isn't covered by the +layout.server guard (mirrors
  // the impersonate action).
  if (locals.staffProfile?.staffRole !== 'admin') throw error(403);

  const filters = parseTalentFilters(url.searchParams);
  const { where } = buildTalentWhere(filters);
  const orderBy = buildOrderBy(filters.sort, filters.dir);

  const talents = await prisma.talent.findMany({
    where,
    orderBy,
    select: TALENT_ROW_SELECT,
  });

  const rows = talents.map((row) => {
    const t = projectTalentRow(row);
    const parentName = [row.parentPrenom, row.parentNom]
      .filter(Boolean)
      .join(' ');
    const lastActive = t.lastActiveAt
      ? new Date(t.lastActiveAt).toLocaleDateString('fr-FR')
      : '';
    return [
      row.nom,
      row.prenom,
      row.user?.email ?? '',
      row.phone ?? '',
      civiliteLabel(row.civilite),
      row.niveau ? niveauLabel(row.niveau) : '',
      t.campus ?? '',
      TALENT_STATUS_LABELS[t.status],
      t.onboardingStep ?? '',
      parentName,
      row.parentEmail ?? '',
      row.parentPhone ?? '',
      t.parentStatus ? PARENT_STATUS_LABELS[t.parentStatus] : '',
      // The decision for the dossier in hand, which since the decision became
      // annual is this talent's CURRENT year and not their whole history. That is
      // the right reading for a triage sheet, and the wrong one for "may we
      // publish a photo": a refusal from a closed year reads « En attente » here,
      // because the guardian is being asked again. The header says so, and
      // `stats_compliance_status` returns the standing interdictions as a figure.
      IMAGE_RIGHTS_STATUS_LABELS[imageRightsStatus(row)],
      t.xp,
      t.eventsCount,
      lastActive,
    ];
  });

  const xlsx = buildXlsx({
    name: 'Talents',
    headers: [
      'Nom',
      'Prénom',
      'Email élève',
      'Téléphone élève',
      'Civilité',
      'Niveau',
      'Campus',
      'Statut onboarding',
      'Étape onboarding',
      'Parent',
      'Email parent',
      'Téléphone parent',
      'Statut parent',
      "Droit à l'image (année en cours)",
      'XP',
      'Événements',
      'Dernière activité',
    ],
    rows,
    colWidths: [
      16, 16, 26, 16, 10, 10, 18, 16, 18, 22, 26, 16, 12, 14, 8, 11, 16,
    ],
  });

  // `buildXlsx` returns an exactly-sized Uint8Array, so its backing buffer is
  // the whole payload. Hand the ArrayBuffer to Response (BodyInit) directly.
  return new Response(xlsx.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Talents.xlsx"',
    },
  });
};
