/**
 * Enum coverage, read from the schema.
 *
 * This is the piece that makes the generator maintain itself. The list of
 * enums is NOT written here: it is parsed out of `schema.prisma` with the same
 * `getDMMF` that `scripts/gen-db-erd.ts` already uses. So the day somebody adds
 * a module key, an XP source, a presence status or a broadcast state, this check
 * starts demanding a row for it, in the pull request that added it, without
 * anybody having remembered to update a list.
 *
 * That inverts the usual failure. A hand-maintained coverage list goes stale
 * silently and the first sign is a screen nobody could test; a derived one fails
 * loudly and immediately, on the branch responsible.
 *
 * Nullable enum columns are counted as covered by their values only. A `null` is
 * not an enum value, and demanding one would force a nonsense row for every
 * optional column in the schema.
 *
 * One value in the schema can also be a value this generator must NOT write, and
 * that is `NEVER_SEEDED_VALUES` below. Same idea as `NEVER_SEEDED` in
 * `coverage.ts`, whose header carries why an exemption list is split by intent:
 * this one is the structural half only, one line per value with the reason it
 * cannot exist here. There is no debt half, because a missing enum value is a
 * scenario away and belongs in the branch that noticed it.
 */

import type { PrismaClient } from '@prisma/client';
import { BROADCAST_OUTSTANDING_STATUSES } from '../../../src/lib/domain/broadcasts';
import { loadDatamodel } from '../schema';

/**
 * Enum values a generated database must not carry, keyed `Enum.value`.
 *
 * One-directional, exactly like `coverage.ts`'s: `--check` can be pointed at a
 * database somebody has since used, and a campaign genuinely queued from the
 * composer there is a correct row. What is refused is the GENERATOR writing one,
 * and that is `assert/inertness.ts`, narrowed to `sd_` ids.
 */
const NEVER_SEEDED_VALUES: Readonly<Record<string, string>> = {
  // ── L'isolation du worker de campagnes. À ne jamais lever. ──
  // Dérivé de la classification du domaine, donc un statut non terminal ajouté
  // demain arrive exempté ici, et refusé par `assert/inertness.ts`, sans que
  // personne ait à se souvenir de cette liste.
  ...Object.fromEntries(
    BROADCAST_OUTSTANDING_STATUSES.map((status) => [
      `BroadcastStatus.${status}`,
      'une campagne dans ce statut n’est pas un fait, c’est du travail que /api/jobs/broadcasts/process réclame et envoie : la semer, c’est envoyer. Son absence EST l’isolation du worker de campagnes, au même titre qu’un `Campus.externalName` vide l’est pour le worker Salesforce. Ce qu’on perd est réel et assumé : les filtres « En file » et « En cours » de /staff/admin/broadcasts n’ont pas d’exemple semé. L’état reste à un clic, en rejouant un destinataire en échec depuis la fiche d’une campagne, et le jeu de données en porte.',
    ]),
  ),
  'BroadcastRecipientStatus.pending':
    'la ligne que la boucle d’envoi pagine. Voir `BroadcastStatus.queued` : un destinataire en attente sous une campagne terminale est le même envoi une couche plus bas, atteignable par la reprise d’une campagne bloquée comme par une remise en file manuelle.',
};

export type EnumTarget = {
  enumName: string;
  model: string;
  field: string;
  values: string[];
};

/** Where each enum is actually used, so a value can be counted somewhere. */
export async function enumTargets(): Promise<EnumTarget[]> {
  const datamodel = await loadDatamodel();

  const byName = new Map(
    datamodel.enums.map((entry) => [
      entry.name,
      entry.values.map((v) => v.name),
    ]),
  );
  const targets: EnumTarget[] = [];

  for (const model of datamodel.models) {
    for (const field of model.fields) {
      if (field.kind !== 'enum') continue;
      const values = byName.get(field.type);
      if (!values) continue;
      targets.push({
        enumName: field.type,
        model: model.name,
        field: field.name,
        values,
      });
    }
  }

  return targets;
}

/**
 * An enum can be carried by several columns. It is covered when EVERY value
 * appears somewhere, not when every column carries every value: demanding the
 * latter would require, say, a refused image-rights decision on both the dossier
 * projection and the decision ledger for every combination, which says nothing
 * extra.
 */
export async function missingEnumValues(
  prisma: PrismaClient,
): Promise<string[]> {
  const targets = await enumTargets();
  const seen = new Map<string, Set<string>>();
  const known = new Map<string, string[]>();

  for (const target of targets) {
    known.set(target.enumName, target.values);
    const delegateName = `${target.model.charAt(0).toLowerCase()}${target.model.slice(1)}`;
    const delegate = (prisma as unknown as Record<string, unknown>)[
      delegateName
    ] as
      | { groupBy(args: unknown): Promise<Record<string, unknown>[]> }
      | undefined;
    if (!delegate?.groupBy) continue;

    const rows = await delegate.groupBy({
      by: [target.field],
      _count: { _all: true },
    });
    const found = seen.get(target.enumName) ?? new Set<string>();
    for (const row of rows) {
      const value = row[target.field];
      if (typeof value === 'string') found.add(value);
    }
    seen.set(target.enumName, found);
  }

  const missing: string[] = [];
  for (const [enumName, values] of known) {
    const found = seen.get(enumName) ?? new Set<string>();
    const absent = values.filter(
      (value) =>
        !found.has(value) &&
        !Object.hasOwn(NEVER_SEEDED_VALUES, `${enumName}.${value}`),
    );
    if (absent.length > 0) {
      missing.push(`${enumName}: aucune ligne pour ${absent.join(', ')}`);
    }
  }
  return missing;
}
