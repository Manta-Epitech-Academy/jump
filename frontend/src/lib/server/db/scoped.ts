import type { Cookies } from '@sveltejs/kit';
import { prisma } from '../db';
import {
  CampusScopeViolation,
  planScopedQuery,
  type ScopedModel,
} from './campusScope';
import { READER_TIMEZONE_COOKIE } from '#lib/domain/planningTime.ts';

/**
 * Extracts the campus ID from the authenticated user's profile.
 */
export function getCampusId(locals: App.Locals): string {
  const campusId = locals.staffProfile?.campusId;
  if (!campusId) {
    throw new Error(
      "Impossible de créer des données : Aucun campus associé à l'utilisateur connecté.",
    );
  }
  return campusId;
}

/**
 * Extracts the IANA timezone from the user's campus.
 */
export function getCampusTimezone(locals: App.Locals): string {
  return locals.staffProfile?.campus?.timezone ?? 'Europe/Paris';
}

/**
 * The reader's timezone, for a line about the reader and never for a campus
 * fact (`planningTime.ts` says which is which). Read from the cookie the root
 * layout sets, and validated against the IANA database, since a cookie is
 * whatever the client sent. `fallback` answers until the browser has set it,
 * on a first visit: the campus's, the clock the reader most likely lives on.
 */
export function getReaderTimezone(cookies: Cookies, fallback: string): string {
  const tz = cookies.get(READER_TIMEZONE_COOKIE);
  if (!tz) return fallback;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return fallback;
  }
}

/**
 * The dev workspace's client: every query it runs is held to one campus, by
 * the rule `campusScope.ts` states (`CAMPUS_SCOPE`, `planScopedQuery`). Read it
 * there; this file only applies it.
 *
 * What a caller can rely on:
 *   - a read returns only the campus's rows, a unique read of another campus's
 *     row returns `null` (or throws P2025 for `…OrThrow`), and an update or a
 *     delete of one throws P2025 without touching it;
 *   - a write never moves a row to another campus, and a create is refused
 *     unless the model names an event of the campus;
 *   - a model the rule does not list, and a raw query, throw: they read with
 *     `prisma` and scope by hand, on purpose, where they are written.
 *
 * Its type exposes only the listed models, so the last case is mostly caught by
 * `tsc`; the runtime refusal holds for a client cast past it.
 */
export function scopedPrisma(campusId: string): ScopedPrismaClient {
  return extendedFor(campusId);
}

function extendedFor(campusId: string) {
  return prisma.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const planned = planScopedQuery(campusId, model, operation, args);
        if (planned.eventIds.length > 0) {
          const onCampus = await prisma.event.count({
            where: { id: { in: planned.eventIds }, campusId },
          });
          if (onCampus !== planned.eventIds.length) {
            throw new CampusScopeViolation(
              `${model}.${operation} names an event outside the campus`,
            );
          }
        }
        return query(planned.args);
      },
    },
  });
}

export type ScopedPrismaClient = Pick<
  ReturnType<typeof extendedFor>,
  Uncapitalize<ScopedModel>
>;
