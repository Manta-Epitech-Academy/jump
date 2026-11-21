import { z } from 'zod';
import { gatedQuery } from '#lib/server/remoteFunctions.ts';
import { findPeople } from '#lib/server/services/peopleSearch.ts';

/** The admin command palette's people search (`AdminCommand`). */
export const searchPeople = gatedQuery(
  { admin: true },
  z.string().max(200),
  (q) => findPeople(q),
);
