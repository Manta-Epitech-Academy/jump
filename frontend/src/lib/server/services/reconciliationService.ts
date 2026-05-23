import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';

/**
 * Reconciliation between the talent's confirmed profile (Jump truth, on `Talent`)
 * and what Salesforce last claimed (the `TalentSfImport` mirror).
 *
 * A field is in conflict only when the talent has *confirmed* it (the relevant
 * `*ValidatedAt` is set) AND the two sides diverge. Before confirmation the sync
 * freely re-seeds `Talent`, so there is nothing to reconcile — which is why the
 * confirmation timestamp, not a raw value diff, gates each field. `niveau` is
 * SF-owned (onboarding never sets it) and never appears here.
 */

export const CONFLICT_FIELDS = [
  'nom',
  'prenom',
  'phone',
  'civilite',
  'school',
] as const;
export type ConflictField = (typeof CONFLICT_FIELDS)[number];

export function isConflictField(value: unknown): value is ConflictField {
  return (CONFLICT_FIELDS as readonly unknown[]).includes(value);
}

export interface FieldConflict {
  field: ConflictField;
  /** The talent-confirmed value (Jump truth). */
  jump: string | null;
  /** What Salesforce currently claims. */
  sf: string | null;
}

export interface TalentConflict {
  talentId: string;
  externalId: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  conflicts: FieldConflict[];
}

// Compare on a normalized form so cosmetic differences don't surface as
// conflicts an admin can never truly clear. Text is trimmed (names are
// `.trim()`'d on the Jump side at capture but the SF mirror stores the raw
// claim); phone is reduced to its digits so `+33 6…` and `06…` read as equal.
// The raw stored values are still what we show the reviewer.
const sameText = (a: string | null, b: string | null) =>
  (a?.trim() || null) === (b?.trim() || null);
const samePhone = (a: string | null, b: string | null) =>
  (a?.replace(/\D/g, '') || null) === (b?.replace(/\D/g, '') || null);

export async function listReconciliationConflicts(): Promise<TalentConflict[]> {
  // Only talents that have a mirror and have confirmed at least one section can
  // be in conflict. The diff itself is computed in memory (≤ a few fields each).
  const talents = await prisma.talent.findMany({
    where: {
      sfImport: { isNot: null },
      OR: [
        { infoValidatedAt: { not: null } },
        { highSchoolValidatedAt: { not: null } },
      ],
    },
    select: {
      id: true,
      externalId: true,
      nom: true,
      prenom: true,
      email: true,
      phone: true,
      civilite: true,
      schoolId: true,
      infoValidatedAt: true,
      highSchoolValidatedAt: true,
      school: { select: { name: true } },
      sfImport: {
        select: {
          nom: true,
          prenom: true,
          phone: true,
          civilite: true,
          sfSchoolId: true,
          sfSchool: { select: { name: true } },
        },
      },
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const out: TalentConflict[] = [];
  for (const t of talents) {
    const m = t.sfImport;
    if (!m) continue;
    const conflicts: FieldConflict[] = [];

    if (t.infoValidatedAt) {
      if (!sameText(t.nom, m.nom))
        conflicts.push({ field: 'nom', jump: t.nom, sf: m.nom });
      if (!sameText(t.prenom, m.prenom))
        conflicts.push({ field: 'prenom', jump: t.prenom, sf: m.prenom });
      if (!samePhone(t.phone, m.phone))
        conflicts.push({ field: 'phone', jump: t.phone, sf: m.phone });
      // Civilité maps to Salesforce's binary gender (homme/femme); SF has no
      // representation for `autre` and may carry no gender at all. A conflict is
      // only real — and only resolvable by pushing to SF — when both sides
      // assert a binary gender and disagree. A jump-side `autre`, or a null SF
      // gender, can never reconcile (the next sync re-nulls the mirror), so it
      // would resurface forever; don't surface it.
      if (
        m.civilite &&
        t.civilite !== 'autre' &&
        !sameText(t.civilite, m.civilite)
      )
        conflicts.push({ field: 'civilite', jump: t.civilite, sf: m.civilite });
    }
    // School is compared by canonical id; names are shown to the human reviewer.
    if (t.highSchoolValidatedAt && t.schoolId !== m.sfSchoolId) {
      conflicts.push({
        field: 'school',
        jump: t.school?.name ?? null,
        sf: m.sfSchool?.name ?? null,
      });
    }

    if (conflicts.length > 0) {
      out.push({
        talentId: t.id,
        externalId: t.externalId,
        nom: t.nom,
        prenom: t.prenom,
        email: t.email,
        conflicts,
      });
    }
  }
  return out;
}

/**
 * Resolution is per field, never per talent: the conflict list is field-grained
 * (and so is the CSV export), so siding with one source on one field must not
 * silently rewrite the other fields — including ones that never surfaced as a
 * conflict (e.g. a `civilite='autre'` the diff deliberately hides). Each call
 * touches exactly the one column the reviewer acted on.
 */

/**
 * Accept the Jump side for one field: realign the mirror to the talent's
 * confirmed value, so that conflict clears. Use after the value has been (or
 * will be) pushed to Salesforce — the next sync that brings the same value is
 * then a no-op; until then the mirror is intentionally ahead of SF.
 */
export async function acceptJumpField(
  talentId: string,
  field: ConflictField,
): Promise<void> {
  const t = await prisma.talent.findUniqueOrThrow({
    where: { id: talentId },
    select: {
      nom: true,
      prenom: true,
      phone: true,
      civilite: true,
      schoolId: true,
    },
  });

  const data: Prisma.TalentSfImportUncheckedUpdateInput = {};
  switch (field) {
    case 'nom':
      data.nom = t.nom;
      break;
    case 'prenom':
      data.prenom = t.prenom;
      break;
    case 'phone':
      data.phone = t.phone;
      break;
    case 'civilite':
      data.civilite = t.civilite;
      break;
    case 'school':
      data.sfSchoolId = t.schoolId;
      break;
  }

  await prisma.talentSfImport.update({ where: { talentId }, data });
}

/**
 * Side with Salesforce for one field: overwrite the talent's confirmed value
 * with what SF claims. `nom`/`prenom` are left untouched when SF has no value,
 * so we never blank a required name (in practice SF always carries both — it
 * keys its records on them — so this guard is defensive, not a dead end).
 */
export async function adoptSalesforceField(
  talentId: string,
  field: ConflictField,
): Promise<void> {
  const m = await prisma.talentSfImport.findUniqueOrThrow({
    where: { talentId },
    select: {
      nom: true,
      prenom: true,
      phone: true,
      civilite: true,
      sfSchoolId: true,
    },
  });

  const data: Prisma.TalentUncheckedUpdateInput = {};
  switch (field) {
    case 'nom':
      if (m.nom != null) data.nom = m.nom;
      break;
    case 'prenom':
      if (m.prenom != null) data.prenom = m.prenom;
      break;
    case 'phone':
      data.phone = m.phone;
      break;
    case 'civilite':
      data.civilite = m.civilite;
      break;
    case 'school':
      data.schoolId = m.sfSchoolId;
      break;
  }

  if (Object.keys(data).length === 0) return;
  await prisma.talent.update({ where: { id: talentId }, data });
}
