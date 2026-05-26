import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { fetchSchoolByUai } from '$lib/server/annuaire';

/**
 * Resolve a national UAI to a canonical `School.id`, creating the row lazily on
 * first sight. Only schools actually attended by a talent ever land in the
 * table — the full annuaire is never imported.
 *
 * On first sight we enrich from the official annuaire (name + commune + postal/
 * INSEE). If the annuaire is unreachable, the row is created from `fallbackName`
 * (the name Salesforce or the picker already gave us) and left `resolvedAt`-null;
 * a later resolve of the same UAI enriches it in place. Idempotent and
 * race-safe: a duplicate-create loser adopts the winner's row.
 *
 * Returns null for a blank UAI (caller should fall back to the manual name).
 */
export async function resolveSchoolByUai(
  uai: string | null | undefined,
  fallbackName?: string | null,
): Promise<string | null> {
  const code = uai?.trim();
  if (!code) return null;

  const existing = await prisma.school.findUnique({
    where: { uai: code },
    select: { id: true, resolvedAt: true },
  });
  if (existing) {
    if (!existing.resolvedAt) await enrichSchool(existing.id, code);
    return existing.id;
  }

  const annuaire = await fetchSchoolByUai(code);

  try {
    const created = await prisma.school.create({
      data: annuaire
        ? {
            uai: code,
            name: annuaire.name,
            city: annuaire.city,
            postalCode: annuaire.postalCode,
            inseeCode: annuaire.inseeCode,
            resolvedAt: new Date(),
          }
        : { uai: code, name: fallbackName?.trim() || code, resolvedAt: null },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    // Lost a create race with a concurrent sync/onboarding for the same UAI —
    // the unique(uai) constraint tripped. Adopt the winner's row.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const row = await prisma.school.findUnique({
        where: { uai: code },
        select: { id: true },
      });
      if (row) return row.id;
    }
    throw err;
  }
}

/** Fill a pending row's name/commune/codes once the annuaire resolves the UAI. */
async function enrichSchool(id: string, uai: string): Promise<void> {
  const annuaire = await fetchSchoolByUai(uai);
  if (!annuaire) return;
  await prisma.school.update({
    where: { id },
    data: {
      name: annuaire.name,
      city: annuaire.city,
      postalCode: annuaire.postalCode,
      inseeCode: annuaire.inseeCode,
      resolvedAt: new Date(),
    },
  });
}
