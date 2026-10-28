/**
 * What the writes on an open catalogue share: the event categories
 * (`eventCategories.ts`) and the workshop domains (`workshopDomains.ts`). Each is
 * a list the team authors over the API, keyed by a name that never changes,
 * archived rather than deleted, so the same two moments come up in both.
 */

import { Prisma } from '@prisma/client';
import { OperationRefusedError } from '../errors';

/**
 * The archive instant to write: untouched when the call does not say, cleared on
 * unarchive, and on archive the first instant kept, so repeating the call
 * changes nothing.
 */
export function archivedAtFor(
  archived: boolean | undefined,
  alreadyArchived: boolean,
): Date | null | undefined {
  if (archived === undefined) return undefined;
  if (!archived) return null;
  return alreadyArchived ? undefined : new Date();
}

/**
 * Runs the write, refusing with `refusal` rather than failing when another call
 * took this key or this label since they were read: a retry after a timeout,
 * overlapping the call it retries. Run again, a call reads the state the other
 * one left, and updates it or names the label's holder.
 */
export async function refusingRaces(
  refusal: string,
  write: () => Promise<unknown>,
): Promise<void> {
  try {
    await write();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new OperationRefusedError(refusal);
    }
    throw err;
  }
}
