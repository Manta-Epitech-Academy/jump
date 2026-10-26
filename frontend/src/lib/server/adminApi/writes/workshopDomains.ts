/**
 * The class A write on the workshop domain catalogue: create, rename, archive or
 * unarchive one domain, identified by its key.
 *
 * One write for the entity, with patch semantics: a key that does not exist yet
 * creates a domain (a label is then required), and on an existing key only the
 * fields given change. Bounded to the one named row, sends nothing, and
 * reversible by writing the previous value back, which the audit row keeps.
 *
 * There is deliberately no delete. `config_workshops` returns every key, so a
 * delete would be a target a model could pick on its own, which is class C; and
 * a subject or a badge rule that names a domain has to keep resolving it.
 * "Remove" is `archived: true`: the domain stops being given to a subject, and
 * every subject that carries it keeps it (`writeWorkshop` holds that rule). The
 * link onto it is `Restrict`, so a hand-deletion of one still in use fails
 * loudly.
 *
 * Which domains a subject is filed under is not written here: it is a field of
 * the activity (`write_workshop`).
 */

import { prisma } from '$lib/server/db';
import {
  WORKSHOP_DOMAIN_SELECT,
  workshopDomainView,
} from '$lib/server/services/workshopCatalogue';
import { OperationRefusedError } from '../errors';
import { archivedAtFor, refusingRaces } from './catalogue';
import type { WriteOutcome } from '../plan';

export type WorkshopDomainPatch = {
  domainKey: string;
  label?: string;
  archived?: boolean;
};

async function stateOf(key: string) {
  const row = await prisma.workshop_Domain.findUnique({
    where: { key },
    select: WORKSHOP_DOMAIN_SELECT,
  });
  if (!row) return null;
  const { key: domainKey, ...view } = workshopDomainView(row);
  return { domainKey, ...view };
}

/**
 * Refuses a label another domain already reads as, whatever the case: two
 * entries a person cannot tell apart in the filter are one domain typed twice,
 * and a subject would be filed under either at random.
 */
async function refuseTakenLabel(key: string, label: string) {
  const holder = await prisma.workshop_Domain.findFirst({
    where: { key: { not: key }, label: { equals: label, mode: 'insensitive' } },
    select: { key: true, label: true },
  });
  if (holder) {
    throw new OperationRefusedError(
      `Le libellé « ${holder.label} » est déjà celui du domaine « ${holder.key} ». Renommez celui-ci, ou donnez un autre libellé.`,
    );
  }
}

export async function writeWorkshopDomain(
  params: WorkshopDomainPatch,
): Promise<WriteOutcome> {
  const key = params.domainKey;
  const before = await stateOf(key);
  const label = params.label?.trim();
  if (label) await refuseTakenLabel(key, label);
  const archivedAt = archivedAtFor(params.archived, before?.archived ?? false);
  const race = `Un autre appel vient d'écrire le domaine « ${key} » ou son libellé. Relancez celui-ci.`;

  if (before) {
    await refusingRaces(race, () =>
      prisma.workshop_Domain.update({
        where: { key },
        data: { label, archivedAt },
      }),
    );
  } else {
    if (!label) {
      throw new OperationRefusedError(
        `Le domaine « ${key} » n'existe pas encore : pour le créer, donnez-lui un libellé (label).`,
      );
    }
    await refusingRaces(race, () =>
      prisma.workshop_Domain.create({ data: { key, label, archivedAt } }),
    );
  }

  return { applied: true, before, after: await stateOf(key) };
}
