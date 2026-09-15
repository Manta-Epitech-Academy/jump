/**
 * The CTFd origins a talent's entry submit is allowed to reach.
 *
 * Read from the `Workshop_Instance` rows because that is the only source that
 * cannot drift: the same rows the entry action redirects to, so an instance
 * added over the API works the moment it is offered, and one nobody curated is
 * not in the policy.
 *
 * CACHED FOR A MINUTE, and that cache is a read cache and not state: every pod
 * computes its own, nothing is authoritative here, and the worst a stale entry
 * costs is up to a minute before a brand-new instance's row can be entered. The
 * alternative is a query on every rendered page, for a value that changes when
 * an admin declares an activity, which is a handful of times a year.
 *
 * A database that cannot be reached yields the empty list rather than throwing:
 * the page still renders, and only the activity row stops opening.
 */

import { prisma } from '$lib/server/db';

const TTL_MS = 60_000;

let cached: string[] = [];
let expiresAt = 0;

export async function workshopBaseUrls(): Promise<string[]> {
  const now = Date.now();
  if (now < expiresAt) return cached;
  try {
    const rows = await prisma.workshop_Instance.findMany({
      where: { enabled: true },
      select: { baseUrl: true },
    });
    cached = rows.map((row) => row.baseUrl);
  } catch {
    cached = [];
  }
  expiresAt = now + TTL_MS;
  return cached;
}
