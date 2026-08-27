/**
 * Who the E2E suite is, and where each identity's session is stored.
 *
 * Prisma-free on purpose: `playwright.config.ts` and every spec import this, and
 * pulling a database client into config resolution would make even
 * `playwright --list` open a connection. The seeding that USES this table lives
 * in `./seed.ts`.
 *
 * Every id is a literal. `@default(cuid())` is only a default, so a fixture can
 * name its own rows: the specs then address them directly
 * (`/staff/dev/events/${E2E.eventId}/emargement`) with no context file to write
 * and no lookup to do, and the teardown is exactly scoped.
 *
 * Every account lives under `@e2e.invalid`, the same trick the load-test pool
 * uses with `@loadtest.invalid`: it cannot collide with a real address, and it
 * makes the purge a single predicate.
 */
import path from 'node:path';

export const E2E_DOMAIN = '@e2e.invalid';

export const E2E = {
  campusId: 'e2e-campus',
  eventId: 'e2e-event-emargement',

  /** Dev-workspace member: `can('devMember')`, campus-scoped. */
  dev: { userId: 'e2e-user-dev', email: `dev${E2E_DOMAIN}` },
  /** Admin: the other staff space, used to assert the cross-space bounce. */
  admin: { userId: 'e2e-user-admin', email: `admin${E2E_DOMAIN}` },

  /** Onboarding finished for the year in progress: walks straight in. */
  talentReady: {
    userId: 'e2e-user-talent-ready',
    talentId: 'e2e-talent-ready',
    email: `talent-ready${E2E_DOMAIN}`,
    nom: 'READYTEST',
    prenom: 'Alix',
  },
  /** Nothing signed: belongs in the welcome / onboarding funnel. */
  talentFresh: {
    userId: 'e2e-user-talent-fresh',
    talentId: 'e2e-talent-fresh',
    email: `talent-fresh${E2E_DOMAIN}`,
    nom: 'FRESHTEST',
    prenom: 'Camille',
  },

  /** Guardian who still owes an act on their child: held inside the flow. */
  parentPending: {
    userId: 'e2e-user-parent-pending',
    email: `parent-pending${E2E_DOMAIN}`,
  },
  /** Guardian who owes nothing: lands on the thank-you page. */
  parentSettled: {
    userId: 'e2e-user-parent-settled',
    email: `parent-settled${E2E_DOMAIN}`,
  },
} as const;

/** Every account the fixture owns, which is every session `auth.setup.ts` mints. */
export const E2E_ACCOUNTS = [
  E2E.dev,
  E2E.admin,
  E2E.talentReady,
  E2E.talentFresh,
  E2E.parentPending,
  E2E.parentSettled,
] as const;

const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth');

/** `dev@e2e.invalid` -> `<...>/tests/e2e/.auth/dev.json` */
export function storageStatePath(email: string): string {
  return path.join(AUTH_DIR, `${email.split('@')[0]}.json`);
}
