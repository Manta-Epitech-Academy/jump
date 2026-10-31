/**
 * The class A write on a campus: create one, change its configuration, or
 * remove one nothing references.
 *
 * A campus is named by its name, the vocabulary every other operation takes,
 * so the write creates one when no campus has the name and patches it
 * otherwise (case aside: "lille" patches "Lille" rather than minting a twin).
 *
 * Every field it sets reaches somewhere quietly, which is why each is checked
 * before it is stored rather than trusted:
 * - `externalName` is the campus's name in Salesforce, and setting it is what
 *   lets the worker be served a sync source for it (`syncConfigService`);
 * - `timezone` dates every day-keyed figure and screen of the campus, so an
 *   unknown zone is refused instead of failing the first time it is read;
 * - `departement` decides the school holidays and public holidays the calendar
 *   shows, through its académie;
 * - `contactAddress` is quoted by transactional mails (`{{email_contact_campus}}`).
 *
 * Removing one is not class C, though every campus name is readable: it is
 * refused while ANY row references the campus, so it can only ever take away a
 * name nobody uses yet, which recreating it gives back. `CAMPUS_REFERENCES` is
 * that list, and `campusReferences.integration.test.ts` fails when the schema
 * gains a relation to `Campus` it does not count.
 *
 * Safe to repeat: it sets values rather than adjusting them.
 */

import { prisma } from '$lib/server/db';
import { academieOf } from '$lib/domain/school';
import { OperationRefusedError } from '../errors';
import type { WriteOutcome } from '../plan';
import { refusingRaces } from './catalogue';

/**
 * Every relation a campus can be referenced by, counted before a removal, with
 * how to name what it counts. Keyed by the relation field on `Campus`.
 */
export const CAMPUS_REFERENCES = {
  staffProfiles: 'membres de l’équipe',
  events: 'événements',
  participations: 'inscriptions',
  closings: 'closings',
  invitations: 'invitations',
  broadcasts: 'envois groupés',
  minigameAttempts: 'parties de jeu',
  xpGrants: 'gains d’XP',
  xpRewards: 'récompenses',
  signatories: 'signataires',
  syncSources: 'sources de synchronisation',
  workshopEntries: 'participations aux activités',
  homeNote: 'mot du campus',
  homeHighlight: 'événement mis en avant',
} as const;

type CampusState = {
  campus: string;
  externalName: string | null;
  timezone: string;
  departement: string | null;
  contactAddress: string | null;
};

const SELECT = {
  id: true,
  name: true,
  externalName: true,
  timezone: true,
  departement: true,
  contactEmail: true,
} as const;

function stateOf(row: {
  name: string;
  externalName: string | null;
  timezone: string;
  departement: string | null;
  contactEmail: string | null;
}): CampusState {
  return {
    campus: row.name,
    externalName: row.externalName,
    timezone: row.timezone,
    departement: row.departement,
    contactAddress: row.contactEmail,
  };
}

function refuseUnknownTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: timezone });
  } catch {
    throw new OperationRefusedError(
      `Fuseau horaire inconnu : « ${timezone} ». Donnez un nom IANA, par exemple Europe/Paris ou Indian/Reunion.`,
    );
  }
}

function refuseUnknownDepartement(departement: string) {
  if (academieOf(departement) === null) {
    throw new OperationRefusedError(
      `Département inconnu : « ${departement} ». Donnez son code INSEE, par exemple 75, 2A ou 974.`,
    );
  }
}

/** Refuses a name or an external name another campus holds, naming it. */
async function refuseTaken(
  field: 'name' | 'externalName',
  value: string,
  ownId: string | null,
) {
  const holder = await prisma.campus.findFirst({
    where: { [field]: { equals: value, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (holder && holder.id !== ownId) {
    throw new OperationRefusedError(
      field === 'name'
        ? `Un campus s'appelle déjà « ${holder.name} ».`
        : `Le nom Salesforce « ${value} » est déjà celui du campus « ${holder.name} ».`,
    );
  }
}

async function referencesOf(id: string): Promise<string[]> {
  const counts = await prisma.campus.findUniqueOrThrow({
    where: { id },
    select: {
      _count: {
        select: Object.fromEntries(
          Object.keys(CAMPUS_REFERENCES)
            .filter(
              (field) => field !== 'homeNote' && field !== 'homeHighlight',
            )
            .map((field) => [field, true]),
        ),
      },
      homeNote: { select: { campusId: true } },
      homeHighlight: { select: { campusId: true } },
    },
  });
  const many = counts._count as Record<string, number>;
  const found = Object.entries(many)
    .filter(([, n]) => n > 0)
    .map(
      ([field, n]) =>
        `${CAMPUS_REFERENCES[field as keyof typeof CAMPUS_REFERENCES]} (${n})`,
    );
  if (counts.homeNote) found.push(CAMPUS_REFERENCES.homeNote);
  if (counts.homeHighlight) found.push(CAMPUS_REFERENCES.homeHighlight);
  return found;
}

export async function writeCampus(params: {
  campus: string;
  rename?: string;
  externalName?: string | null;
  timezone?: string;
  departement?: string | null;
  contactAddress?: string | null;
  remove?: true;
}): Promise<WriteOutcome> {
  const name = params.campus.trim();
  const existing = await prisma.campus.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: SELECT,
  });

  if (params.remove) {
    if (!existing) {
      throw new OperationRefusedError(
        `Aucun campus ne s'appelle « ${name} ». meta_scope liste ceux qui existent.`,
      );
    }
    const references = await referencesOf(existing.id);
    if (references.length > 0) {
      throw new OperationRefusedError(
        `Le campus « ${existing.name} » ne peut pas être supprimé, il est référencé : ${references.join(', ')}. Seul un campus que rien n'utilise encore se supprime.`,
      );
    }
    await prisma.campus.delete({ where: { id: existing.id } });
    return { applied: true, before: stateOf(existing), after: null };
  }

  const externalName =
    params.externalName === undefined
      ? undefined
      : params.externalName?.trim() || null;
  const departement =
    params.departement === undefined
      ? undefined
      : params.departement?.trim() || null;
  const contactEmail =
    params.contactAddress === undefined
      ? undefined
      : params.contactAddress?.trim() || null;
  const rename = params.rename?.trim();

  if (params.timezone !== undefined) refuseUnknownTimezone(params.timezone);
  if (departement) refuseUnknownDepartement(departement);
  if (externalName) {
    await refuseTaken('externalName', externalName, existing?.id ?? null);
  }

  if (!existing) {
    if (rename) {
      throw new OperationRefusedError(
        `Aucun campus ne s'appelle « ${name} » : il n'y a rien à renommer. Pour en créer un, donnez son nom dans campus.`,
      );
    }
    let created: Parameters<typeof stateOf>[0] | null = null;
    await refusingRaces(`Un campus s'appelle déjà « ${name} ».`, async () => {
      created = await prisma.campus.create({
        data: {
          name,
          externalName: externalName ?? null,
          timezone: params.timezone ?? 'Europe/Paris',
          departement: departement ?? null,
          contactEmail: contactEmail ?? null,
        },
        select: SELECT,
      });
    });
    return { applied: true, before: null, after: stateOf(created!) };
  }

  if (rename) await refuseTaken('name', rename, existing.id);
  let updated: Parameters<typeof stateOf>[0] | null = null;
  await refusingRaces(
    'Un autre campus porte déjà ce nom ou ce nom Salesforce.',
    async () => {
      updated = await prisma.campus.update({
        where: { id: existing.id },
        data: {
          name: rename,
          externalName,
          timezone: params.timezone,
          departement,
          contactEmail,
        },
        select: SELECT,
      });
    },
  );
  return { applied: true, before: stateOf(existing), after: stateOf(updated!) };
}
