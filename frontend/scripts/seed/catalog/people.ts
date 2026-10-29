/**
 * The name pools generated identities are drawn from.
 *
 * Carried over from `scripts/seed-lyon-talents.ts`, which this generator
 * replaces. They are ordinary French given names and surnames, common enough to
 * look like a real cohort and common enough that no combination points at
 * anybody: the pools are combined by the seeded RNG, so a name here is a name,
 * never a person.
 *
 * Kept deliberately small. A wider pool would not make the dataset more useful,
 * and a generated-name library would add a dependency for a list that changes
 * once a decade.
 */

import type { Civilite } from '../../../src/lib/domain/profile';

/**
 * Given names by the civility a person carries, so a name and a civility can
 * never disagree on a generated talent. `addTalent` draws the civility first,
 * from production's split, then a name from its list: a single mixed pool would
 * make the split 50/50 whatever production says, and a « Léa » recorded as a
 * man.
 *
 * The epicene names are filed on one side each, where they are most common;
 * nothing reads a name back to infer anything.
 */
export const PRENOMS = {
  femme: [
    'Léa',
    'Emma',
    'Chloé',
    'Manon',
    'Inès',
    'Camille',
    'Sarah',
    'Louise',
    'Jade',
    'Anna',
    'Alice',
    'Lola',
    'Zoé',
    'Lina',
    'Romane',
    'Eva',
    'Maëlle',
    'Lou',
    'Mila',
    'Capucine',
    'Margaux',
  ],
  homme: [
    'Hugo',
    'Lucas',
    'Nathan',
    'Enzo',
    'Maxime',
    'Théo',
    'Adam',
    'Mathis',
    'Ethan',
    'Liam',
    'Noah',
    'Tom',
    'Léo',
    'Gabriel',
    'Arthur',
    'Raphaël',
    'Sacha',
    'Aaron',
    'Naël',
    'Soan',
    'Maël',
  ],
} as const satisfies Record<Exclude<Civilite, 'autre'>, readonly string[]>;

export const NOMS = [
  'Martin',
  'Bernard',
  'Dubois',
  'Thomas',
  'Robert',
  'Richard',
  'Petit',
  'Durand',
  'Leroy',
  'Moreau',
  'Simon',
  'Laurent',
  'Lefebvre',
  'Michel',
  'Garcia',
  'David',
  'Bertrand',
  'Roux',
  'Vincent',
  'Fournier',
  'Morel',
  'Girard',
  'André',
  'Mercier',
  'Dupont',
  'Lambert',
  'Bonnet',
  'François',
  'Martinez',
  'Legrand',
  'Garnier',
  'Faure',
  'Rousseau',
  'Blanc',
  'Guerin',
] as const;

/** Staff bear the same names; only the mail domain tells the two apart. */
export const STAFF_PRENOMS = [
  'Pauline',
  'Éliot',
  'Nadia',
  'Marc',
  'Sofia',
  'Julien',
  'Awa',
  'Rémi',
  'Clara',
  'Bastien',
  'Yasmine',
  'Fabien',
] as const;

/**
 * The two mail domains, and the reason they differ.
 *
 * Staff sign in through Microsoft and their address must be `@epitech.eu`, so
 * that half has to look real. Everything else uses a reserved TLD (RFC 2606),
 * which cannot resolve and cannot receive: if an outbound guard is ever wrong,
 * the mail fails at DNS instead of reaching a stranger.
 */
export const STAFF_MAIL_DOMAIN = 'epitech.eu';
export const SEED_MAIL_DOMAIN = 'seed.invalid';
