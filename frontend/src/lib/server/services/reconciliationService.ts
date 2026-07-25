import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { civiliteLabel, parentTypeLabel } from '$lib/domain/profile';
import { normalizePhoneToE164 } from '$lib/domain/phone';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { upsertSchoolingYearRecord } from '$lib/server/services/schoolingService';
import type { DiffField } from '$lib/domain/reconciliation';

// The field catalogue lives in `$lib/domain/reconciliation` (pure domain data,
// so the client page can import it too). `isDiffField` is re-exported here for
// the server-side callers that reach for it alongside the reconciliation
// queries below; everything else they import from the domain module directly.
export { isDiffField } from '$lib/domain/reconciliation';

/**
 * Diff between the talent's confirmed profile (Jump truth, on `Talent`) and what
 * Salesforce last claimed (the `TalentSfImport` mirror).
 *
 * This is a *diff*, not an accusation: a field surfaces in two flavours.
 *  - `conflict` — both sides assert a value and they disagree. The one manual
 *    action is adopting Salesforce (overwrite the talent); keeping Jump is the
 *    default and needs no click (see the `adoptSalesforceField` block below).
 *  - `missing`  — Jump has a confirmed value Salesforce lacks. There is nothing
 *    to adopt (SF is empty); the value reaches SF only via the CSV export, and
 *    the row clears once the next sync sees SF carry it.
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

export type DiffKind = 'conflict' | 'missing';

export interface FieldDiff {
  field: DiffField;
  kind: DiffKind;
  /** The talent-confirmed value (Jump truth). */
  jump: string | null;
  /** What Salesforce currently claims (null when `kind` is `missing`). */
  sf: string | null;
  /**
   * Stable match key behind the display value, when the field references an
   * entity rather than a scalar. Today only `school`: `jump`/`sf` carry the
   * lycée *name* (what a human reads), `jumpKey`/`sfKey` carry its **UAI** (what
   * Salesforce matches on — names are fuzzy and non-unique, the UAI is exact).
   * `undefined` for scalar fields, whose value is already its own key.
   */
  jumpKey?: string | null;
  sfKey?: string | null;
}

export interface TalentDiff {
  talentId: string;
  externalId: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  diffs: FieldDiff[];
  /** Most recent confirmation instant (ISO), see `latestConfirmedAt`. */
  confirmedAt: string;
}

/**
 * The most recent of a talent's confirmation timestamps, as an ISO string. Used
 * only to window the CSV export by *when the talent confirmed* (see the export
 * endpoint) and to count talents per period in the menu; it never changes what
 * the page shows. At least one input is always set for a talent that surfaces
 * here (every query below gates on a confirmed section), so the fallback to the
 * epoch is unreachable defence.
 */
function latestConfirmedAt(...dates: (Date | null | undefined)[]): string {
  const ms = dates.filter((d): d is Date => d != null).map((d) => d.getTime());
  return new Date(ms.length ? Math.max(...ms) : 0).toISOString();
}

// Compare on a normalized form so cosmetic differences don't surface as a diff a
// reviewer can never truly clear. Text is trimmed (names are `.trim()`'d on the
// Jump side at capture but the SF mirror stores the raw claim); phone is reduced
// to canonical E.164 so `+33 6…`, `06…` and a bare national `765719823` all read
// as equal (a bare-digit comparison would mismatch `33…` against `0…`). Values
// that don't parse fall back to their digits so two equal raw strings still
// match. The raw stored values are still what we show the reviewer.
const sameText = (a: string | null, b: string | null) =>
  (a?.trim() || null) === (b?.trim() || null);
const samePhone = (a: string | null, b: string | null) => {
  const canon = (v: string | null) =>
    normalizePhoneToE164(v) ?? (v?.replace(/\D/g, '') || null);
  return canon(a) === canon(b);
};

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
      user: { select: { email: true } },
      phone: true,
      civilite: true,
      schoolId: true,
      infoValidatedAt: true,
      highSchoolValidatedAt: true,
      techInterestsValidatedAt: true,
      generalInterestsValidatedAt: true,
      school: { select: { name: true, uai: true } },
      sfImport: {
        select: {
          nom: true,
          prenom: true,
          phone: true,
          civilite: true,
          sfSchoolId: true,
          sfSchool: { select: { name: true, uai: true } },
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
        jumpKey: t.school?.uai ?? null,
        sfKey: m.sfSchool?.uai ?? null,
      });
    }

    if (diffs.length > 0) {
      out.push({
        talentId: t.id,
        externalId: t.externalId,
        nom: t.nom,
        prenom: t.prenom,
        email: t.user?.email ?? null,
        diffs,
        confirmedAt: latestConfirmedAt(
          t.infoValidatedAt,
          t.highSchoolValidatedAt,
          t.techInterestsValidatedAt,
          t.generalInterestsValidatedAt,
        ),
      });
    }
  }
  return out;
}

/**
 * There is deliberately no "keep Jump" / accept action. Jump is already
 * authoritative (optimistic model): the talent's value shows everywhere that
 * matters, so siding with Jump is the default, not a click. A diff is a *to-do
 * to fix Salesforce*, not a decision pending in Jump — it stays listed (and in
 * the CSV) until Salesforce actually carries the value, at which point the next
 * sync re-aligns the mirror and the row clears on its own. Realigning the mirror
 * by hand here would only drop the row from the export *before* the value
 * reached Salesforce — i.e. lose exactly the data the export exists to push.
 *
 * The one manual action is the reverse: deciding Salesforce is right after all.
 * Resolution is per field, never per talent (the diff list and the CSV are both
 * field-grained), so it touches exactly the one column the reviewer acted on and
 * never the others — including ones that never surfaced (e.g. a `civilite='autre'`
 * the diff deliberately hides).
 */

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

  // schoolId is the cached projection of Schooling_YearRecord (schoolingService),
  // never written to Talent directly - otherwise the current year's ledger row
  // goes stale the moment staff adopt Salesforce's claimed school over Jump's.
  if (field === 'school') {
    const currentSchoolYear = schoolYearOf(new Date(), 'Europe/Paris').label;
    await prisma.$transaction((tx) =>
      upsertSchoolingYearRecord(tx, {
        talentId,
        schoolYear: currentSchoolYear,
        schoolId: m.sfSchoolId,
        source: 'staff',
      }),
    );
    return;
  }

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
  }

  if (Object.keys(data).length === 0) return;
  await prisma.talent.update({ where: { id: talentId }, data });
}

/**
 * Enrichment Salesforce can't hold. The worker payload carries no parent
 * contacts, so they are never a diff to reconcile — but they are exactly the data
 * Jump collects at onboarding that the SF team would want backfilled. Scope is
 * the parent *contact record* (lien, civilité, name, email, phone for each
 * parent) plus the talent's *centres d'intérêt*: contact- and profile-shaped data
 * with an SF home. Interests used to be left out (SF had no field for them); SF
 * now imports them, so they ride the same "à transmettre" rows — see the interest
 * block in `listSalesforceEnrichment`. Equipment and image-rights stay out: still
 * purely operational, no SF column. Surfaced in the on-screen list and the CSV
 * export alike, one labelled row per non-empty field, gated on a confirmed
 * section. Coded values (lien, civilité) are rendered through their canonical
 * labels so the export reads in French, not enum strings.
 */
type EnrichmentFieldDef = {
  key:
    | 'parentType'
    | 'parentCivilite'
    | 'parentNom'
    | 'parentPrenom'
    | 'parentEmail'
    | 'parentPhone'
    | 'parent2Type'
    | 'parent2Civilite'
    | 'parent2Nom'
    | 'parent2Prenom'
    | 'parent2Email'
    | 'parent2Phone';
  label: string;
  /** Maps a stored enum string to its French label; identity for free text. */
  format?: (value: string) => string;
};

const ENRICHMENT_FIELDS: readonly EnrichmentFieldDef[] = [
  { key: 'parentType', label: 'Parent 1 — Lien', format: parentTypeLabel },
  {
    key: 'parentCivilite',
    label: 'Parent 1 — Civilité',
    format: civiliteLabel,
  },
  { key: 'parentNom', label: 'Parent 1 — Nom' },
  { key: 'parentPrenom', label: 'Parent 1 — Prénom' },
  { key: 'parentEmail', label: 'Parent 1 — Email' },
  { key: 'parentPhone', label: 'Parent 1 — Téléphone' },
  { key: 'parent2Type', label: 'Parent 2 — Lien', format: parentTypeLabel },
  {
    key: 'parent2Civilite',
    label: 'Parent 2 — Civilité',
    format: civiliteLabel,
  },
  { key: 'parent2Nom', label: 'Parent 2 — Nom' },
  { key: 'parent2Prenom', label: 'Parent 2 — Prénom' },
  { key: 'parent2Email', label: 'Parent 2 — Email' },
  { key: 'parent2Phone', label: 'Parent 2 — Téléphone' },
] as const;

export interface TalentEnrichment {
  talentId: string;
  externalId: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  fields: { label: string; value: string }[];
  /** Most recent confirmation instant (ISO), see `latestConfirmedAt`. */
  confirmedAt: string;
}

export async function listSalesforceEnrichment(): Promise<TalentEnrichment[]> {
  const talents = await prisma.talent.findMany({
    where: { infoValidatedAt: { not: null } },
    select: {
      id: true,
      externalId: true,
      nom: true,
      prenom: true,
      user: { select: { email: true } },
      parentType: true,
      parentCivilite: true,
      parentNom: true,
      parentPrenom: true,
      parentEmail: true,
      parentPhone: true,
      parent2Type: true,
      parent2Civilite: true,
      parent2Nom: true,
      parent2Prenom: true,
      parent2Email: true,
      parent2Phone: true,
      infoValidatedAt: true,
      techInterestsValidatedAt: true,
      generalInterestsValidatedAt: true,
      interestsFreeText: true,
      interests: {
        select: {
          interest: { select: { nom: true, kind: true, order: true } },
        },
      },
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const out: TalentEnrichment[] = [];
  for (const t of talents) {
    const fields = ENRICHMENT_FIELDS.map(({ key, label, format }) => {
      const raw = (t[key] ?? '').trim();
      return { label, value: format ? format(raw) : raw };
    }).filter((f) => f.value);

    // Centres d'intérêt: Jump-only data SF now imports. Names only (emoji
    // dropped) joined by ';' so a multi-select picklist import matches each
    // value exactly; tech and perso stay on separate rows (distinct SF fields),
    // and the free-text "Autres" rides the same gate. All three are gated on a
    // confirmed interests section, never on the data's mere presence: a goBack
    // from a later step clears the confirmation flags but keeps the structured
    // picks and the free text as form prefill, so gating on presence would leak
    // a half-confirmed, in-progress onboarding into the export.
    if (t.techInterestsValidatedAt || t.generalInterestsValidatedAt) {
      const joinKind = (tech: boolean) =>
        t.interests
          .map((ti) => ti.interest)
          .filter((i) => (i.kind === 'tech') === tech)
          .sort((a, b) => a.order - b.order)
          .map((i) => i.nom)
          .join(';');
      const tech = joinKind(true);
      const perso = joinKind(false);
      if (tech) fields.push({ label: "Centres d'intérêt — Tech", value: tech });
      if (perso)
        fields.push({ label: "Centres d'intérêt — Perso", value: perso });
      const freeText = (t.interestsFreeText ?? '').trim();
      if (freeText)
        fields.push({ label: "Centres d'intérêt — Autres", value: freeText });
    }

    if (fields.length > 0) {
      out.push({
        talentId: t.id,
        externalId: t.externalId,
        nom: t.nom,
        prenom: t.prenom,
        email: t.user?.email ?? null,
        fields,
        confirmedAt: latestConfirmedAt(
          t.infoValidatedAt,
          t.techInterestsValidatedAt,
          t.generalInterestsValidatedAt,
        ),
      });
    }
  }
  return out;
}

/**
 * Advance an admin's Salesforce-export high-water mark to `at` — the mirror of
 * `recordOnboardingDocsExport`. Called once the windowed CSV has been assembled
 * so the menu's "depuis le dernier export" delta moves forward on the next load.
 * Fire-and-forget at the call site: a failed write simply re-offers the same
 * talents next time, never blocks the download.
 */
export async function recordSfExport(
  staffProfileId: string,
  at: Date,
): Promise<void> {
  await prisma.staffProfile.update({
    where: { id: staffProfileId },
    data: { sfExportedAt: at },
  });
}
