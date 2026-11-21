import { z } from 'zod';
import { searchAnnuaire } from '#lib/server/annuaire.ts';
import { gatedQuery } from '#lib/server/remoteFunctions.ts';

/**
 * The lycée type-ahead of the wizard's school step. Any talent session, since
 * the wizard runs before the charte is signed, and the answer is the public
 * Éducation nationale directory, nothing about the talent.
 */
export const searchLycees = gatedQuery(
  { talent: 'signedIn' },
  z.string().max(100),
  (q) => searchAnnuaire(q),
);
