import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';

/**
 * Diff between the talent's confirmed profile (Jump truth, on `Talent`) and what
 * Salesforce last claimed (the `TalentSfImport` mirror).
 *
 * This is a *diff*, not an accusation: a field surfaces in two flavours.
 *  - `conflict` — both sides assert a value and they disagree. Actionable: keep
 *    Jump (realign the mirror) or adopt Salesforce (overwrite the talent).
 *  - `missing`  — Jump has a confirmed value Salesforce lacks. There is nothing
 *    to adopt (SF is empty); the only move is to push Jump's value to SF, which
 *    "keep Jump" records by moving the mirror optimistically ahead.
 *
 * A field is only ever compared once the talent has *confirmed* it (the relevant
 * `*ValidatedAt` is set): before that the sync freely re-seeds `Talent`, so there
 * is nothing to reconcile. `niveau` is SF-owned (onboarding never sets it) and
 * never appears here.
 *
 * Fields Salesforce has no column for at all — parent contacts above all (the
 * worker payload carries none of them) — are not reconcilable and never appear
 * in this list. They live in the CSV export as enrichment to backfill into SF;
 * see `listSalesforceEnrichment`.
 */

export const DIFF_FIELDS = [
  'nom',
  'prenom',
  'phone',
  'civilite',
  'school',
] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];

export function isDiffField(value: unknown): value is DiffField {
  return (DIFF_FIELDS as readonly unknown[]).includes(value);
}

export type DiffKind = 'conflict' | 'missing';

export interface FieldDiff {
  field: DiffField;
  kind: DiffKind;
  /** The talent-confirmed value (Jump truth). */
  jump: string | null;
  /** What Salesforce currently claims (null when `kind` is `missing`). */
  sf: string | null;
}

export interface TalentDiff {
  talentId: string;
  externalId: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  diffs: FieldDiff[];
}

// Compare on a normalized form so cosmetic differences don't surface as a diff a
// reviewer can never truly clear. Text is trimmed (names are `.trim()`'d on the
// Jump side at capture but the SF mirror stores the raw claim); phone is reduced
// to its digits so `+33 6…` and `06…` read as equal. The raw stored values are
// still what we show the reviewer.
const sameText = (a: string | null, b: string | null) =>
  (a?.trim() || null) === (b?.trim() || null);
const samePhone = (a: string | null, b: string | null) =>
  (a?.replace(/\D/g, '') || null) === (b?.replace(/\D/g, '') || null);

export async function listSalesforceDiffs(): Promise<TalentDiff[]> {
  // Only talents that have a mirror and have confirmed at least one section can
  // diff. The diff itself is computed in memory (≤ a few fields each).
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

  const out: TalentDiff[] = [];
  for (const t of talents) {
    const m = t.sfImport;
    if (!m) continue;
    const diffs: FieldDiff[] = [];

    if (t.infoValidatedAt) {
      // Names: SF keys its records on them, so it always carries both — only a
      // genuine disagreement is worth surfacing, never a "missing".
      if (!sameText(t.nom, m.nom))
        diffs.push({ field: 'nom', kind: 'conflict', jump: t.nom, sf: m.nom });
      if (!sameText(t.prenom, m.prenom))
        diffs.push({
          field: 'prenom',
          kind: 'conflict',
          jump: t.prenom,
          sf: m.prenom,
        });

      if (t.phone) {
        if (m.phone && !samePhone(t.phone, m.phone))
          diffs.push({
            field: 'phone',
            kind: 'conflict',
            jump: t.phone,
            sf: m.phone,
          });
        else if (!m.phone)
          diffs.push({
            field: 'phone',
            kind: 'missing',
            jump: t.phone,
            sf: null,
          });
      }

      // Civilité maps to Salesforce's binary gender (homme/femme); SF has no
      // representation for `autre`. A jump-side `autre` can never be reconciled
      // (the next sync re-nulls the mirror), so it would resurface forever —
      // don't surface it. A binary civilité diffs as a conflict (SF disagrees)
      // or as missing (SF carries no gender yet, value can be pushed).
      if (t.civilite && t.civilite !== 'autre') {
        if (m.civilite && !sameText(t.civilite, m.civilite))
          diffs.push({
            field: 'civilite',
            kind: 'conflict',
            jump: t.civilite,
            sf: m.civilite,
          });
        else if (!m.civilite)
          diffs.push({
            field: 'civilite',
            kind: 'missing',
            jump: t.civilite,
            sf: null,
          });
      }
    }

    // School is compared by canonical id; names are shown to the human reviewer.
    // Jump confirmed a school SF disagrees with (conflict) or SF never had
    // (missing). The reverse — SF has one Jump confirmed away — isn't a value to
    // push back, so it's left out.
    if (t.highSchoolValidatedAt && t.schoolId && t.schoolId !== m.sfSchoolId) {
      diffs.push({
        field: 'school',
        kind: m.sfSchoolId ? 'conflict' : 'missing',
        jump: t.school?.name ?? null,
        sf: m.sfSchool?.name ?? null,
      });
    }

    if (diffs.length > 0) {
      out.push({
        talentId: t.id,
        externalId: t.externalId,
        nom: t.nom,
        prenom: t.prenom,
        email: t.email,
        diffs,
      });
    }
  }
  return out;
}

/**
 * Resolution is per field, never per talent: the diff list is field-grained (and
 * so is the CSV export), so siding with one source on one field must not silently
 * rewrite the others — including ones that never surfaced (e.g. a
 * `civilite='autre'` the diff deliberately hides). Each call touches exactly the
 * one column the reviewer acted on.
 */

/**
 * Accept the Jump side for one field: realign the mirror to the talent's
 * confirmed value, so that diff clears. Use after the value has been (or will be)
 * pushed to Salesforce — the next sync that brings the same value is then a
 * no-op; until then the mirror is intentionally ahead of SF. For a `missing`
 * field this is how the reviewer marks "pushed to Salesforce".
 */
export async function acceptJumpField(
  talentId: string,
  field: DiffField,
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
 * Side with Salesforce for one field: overwrite the talent's confirmed value with
 * the SF claim. Only ever offered for a `conflict` (SF has a value); a `missing`
 * field has nothing to adopt. `nom`/`prenom` are left untouched when SF has no
 * value, so we never blank a required name (defensive — in practice SF always
 * carries both).
 */
export async function adoptSalesforceField(
  talentId: string,
  field: DiffField,
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

/**
 * Enrichment Salesforce can't hold. The worker payload carries no parent
 * contacts, so they are never a diff to reconcile — but they are exactly the data
 * Jump collects at onboarding that the SF team would want backfilled. Surfaced
 * only in the CSV export, one labelled row per non-empty field, gated on the
 * talent having confirmed their info section.
 */
export const ENRICHMENT_FIELDS = [
  { key: 'parentNom', label: 'Parent 1 — Nom' },
  { key: 'parentPrenom', label: 'Parent 1 — Prénom' },
  { key: 'parentEmail', label: 'Parent 1 — Email' },
  { key: 'parentPhone', label: 'Parent 1 — Téléphone' },
  { key: 'parent2Nom', label: 'Parent 2 — Nom' },
  { key: 'parent2Prenom', label: 'Parent 2 — Prénom' },
  { key: 'parent2Email', label: 'Parent 2 — Email' },
  { key: 'parent2Phone', label: 'Parent 2 — Téléphone' },
] as const;

export interface TalentEnrichment {
  externalId: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  fields: { label: string; value: string }[];
}

export async function listSalesforceEnrichment(): Promise<TalentEnrichment[]> {
  const talents = await prisma.talent.findMany({
    where: { infoValidatedAt: { not: null } },
    select: {
      externalId: true,
      nom: true,
      prenom: true,
      email: true,
      parentNom: true,
      parentPrenom: true,
      parentEmail: true,
      parentPhone: true,
      parent2Nom: true,
      parent2Prenom: true,
      parent2Email: true,
      parent2Phone: true,
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const out: TalentEnrichment[] = [];
  for (const t of talents) {
    const fields = ENRICHMENT_FIELDS.map(({ key, label }) => ({
      label,
      value: (t[key] ?? '').trim(),
    })).filter((f) => f.value);
    if (fields.length > 0) {
      out.push({
        externalId: t.externalId,
        nom: t.nom,
        prenom: t.prenom,
        email: t.email,
        fields,
      });
    }
  }
  return out;
}
