/**
 * The workshop domains, as the 2027 mockup's catalogue names them. Production
 * holds none yet - the team authors them over the admin API, and which list it
 * keeps is still the PO's to choose (#439) - so these are the mockup's, not a
 * measurement, and which subject carries which is placed in `workshops.ts`,
 * never drawn.
 *
 * One more, archived, because « archived and still carried » is the state the
 * archive rule exists for: a subject keeps the domain the team retired, and the
 * catalogue still files it there.
 *
 * Keyed on their natural key, which is the identity the API names, so a seeded
 * key is one `write_workshop_domain` could have written (no `sd_` prefix, which
 * its pattern refuses). That makes them a create-only catalogue like the event
 * categories: a full generation takes them back by key (`wipe`), and
 * `--catalog-only` never writes them, since a populated database's domains are
 * the team's.
 */

import type { PrismaClient } from '@prisma/client';

export const WORKSHOP_DOMAIN = {
  ALGORITHMICS: 'algorithmie',
  AI_DATA: 'ia-data',
  GAME_DEV: 'gamedev',
  CYBERSECURITY: 'cybersecurite',
  ROBOTICS: 'robotique-hardware',
  SYSTEMS: 'systeme',
  PROJECT: 'projet',
  ELECTRONICS: 'electronique',
} as const;

type WorkshopDomainSpec = {
  readonly key: string;
  readonly label: string;
  readonly archived: boolean;
};

export const WORKSHOP_DOMAINS: readonly WorkshopDomainSpec[] = [
  { key: WORKSHOP_DOMAIN.ALGORITHMICS, label: 'Algorithmie', archived: false },
  { key: WORKSHOP_DOMAIN.AI_DATA, label: 'IA/DATA', archived: false },
  { key: WORKSHOP_DOMAIN.GAME_DEV, label: 'GameDev', archived: false },
  {
    key: WORKSHOP_DOMAIN.CYBERSECURITY,
    label: 'Cybersécurité',
    archived: false,
  },
  {
    key: WORKSHOP_DOMAIN.ROBOTICS,
    label: 'Robotique/Hardware',
    archived: false,
  },
  { key: WORKSHOP_DOMAIN.SYSTEMS, label: 'Système', archived: false },
  { key: WORKSHOP_DOMAIN.PROJECT, label: 'Projet', archived: false },
  // Retired once Robotique/Hardware covered it, and still carried.
  { key: WORKSHOP_DOMAIN.ELECTRONICS, label: 'Électronique', archived: true },
];

export const WORKSHOP_DOMAIN_KEYS = WORKSHOP_DOMAINS.map((d) => d.key);

/** Create-only: a key already present is left exactly as it stands. */
export async function seedWorkshopDomains(
  prisma: PrismaClient,
  anchor: Date,
): Promise<number> {
  const { count } = await prisma.workshop_Domain.createMany({
    data: WORKSHOP_DOMAINS.map((domain) => ({
      key: domain.key,
      label: domain.label,
      archivedAt: domain.archived ? anchor : null,
      createdAt: anchor,
      updatedAt: anchor,
    })),
    skipDuplicates: true,
  });
  return count;
}
