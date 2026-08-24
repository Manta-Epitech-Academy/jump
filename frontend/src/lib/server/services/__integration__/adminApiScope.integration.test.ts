/**
 * The tier's second rule, enforced by running it: an unknown scope is a refusal,
 * never a zero.
 *
 * `scope.ts` exists because a filter that names something nonexistent used to
 * come back as `{ campus: "Lile", events: 0 }`, a confident zero with the echoed
 * filter confirming it. Nothing, however, made an operation *use* it: an entry
 * could pass a caller's raw campus name straight into a query and answer zero,
 * which is exactly what `stats_feedback_results` did. So the rule is checked the
 * way the PII rule is, over the whole catalogue rather than an entry at a time:
 * every operation that accepts a scope filter is called with a value that does
 * not exist, and has to refuse.
 *
 * The refusal is also checked to name the values that would have worked, since a
 * bare rejection only invites a second guess.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { UnknownScopeError } from '$lib/server/adminApi/scope';
import {
  ADMIN_API_OPERATIONS,
  type AdminApiOperation,
  type AdminApiOperationName,
} from '$lib/server/adminApi/operations';

const stamp = Date.now();
/** Well-formed, and deliberately not a campus / event anybody has. */
const ABSENT_CAMPUS = `Lile-${stamp}`;
const ABSENT_EVENT = `evt-does-not-exist-${stamp}`;

const reads = Object.entries(ADMIN_API_OPERATIONS).filter(
  ([, operation]) => operation.kind === 'read',
) as [AdminApiOperationName, AdminApiOperation][];

const accepting = (filter: string) =>
  reads.filter(([, operation]) => filter in operation.schema.shape);

describe('an unknown scope is refused, never counted as zero (integration)', () => {
  let campusName = '';
  let campusId = '';

  beforeAll(async () => {
    assertTestDatabase();
    // One real campus, so the refusal has something to list back.
    campusName = `ScopeCampus-${stamp}`;
    const campus = await prisma.campus.create({
      data: { name: campusName, timezone: 'Europe/Paris' },
    });
    campusId = campus.id;
  });

  afterAll(async () => {
    try {
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('has scoped reads to check, so an empty catalogue cannot pass silently', () => {
    expect(accepting('campus').length).toBeGreaterThan(5);
    expect(accepting('eventId').length).toBeGreaterThan(3);
  });

  for (const [name, operation] of accepting('campus')) {
    it(`${name} refuses a campus that does not exist`, async () => {
      const error = await refusalOf(name, operation, {
        campus: ABSENT_CAMPUS,
      });

      expect(error, `${name} answered instead of refusing`).toBeInstanceOf(
        UnknownScopeError,
      );
      expect(error?.message).toContain(ABSENT_CAMPUS);
      // The way out, not just the rejection.
      expect(error?.message).toContain(campusName);
    });
  }

  for (const [name, operation] of accepting('eventId')) {
    it(`${name} refuses an event that does not exist`, async () => {
      const error = await refusalOf(name, operation, {
        eventId: ABSENT_EVENT,
      });

      expect(error, `${name} answered instead of refusing`).toBeInstanceOf(
        UnknownScopeError,
      );
      expect(error?.message).toContain(ABSENT_EVENT);
    });
  }
});

/** Runs the operation and returns what it threw, or null if it answered. */
async function refusalOf(
  name: AdminApiOperationName,
  operation: AdminApiOperation,
  scope: Record<string, unknown>,
): Promise<Error | null> {
  const params = operation.schema.parse({ ...requiredArgsFor(name), ...scope });
  try {
    await operation.run(params, {
      tier: 'core',
      actorUserId: 'test',
      origin: 'http://localhost',
    });
    return null;
  } catch (err) {
    return err as Error;
  }
}

/**
 * Arguments an operation cannot be called without. Explicit on purpose (as in
 * `adminApiNoPii`): a new operation with a required parameter fails loudly on the
 * schema parse above, under its own name, until somebody supplies one here, rather
 * than dropping out of cover.
 *
 * The values need not exist: scope resolution runs before an operation looks
 * anything else up, so the campus or event is what gets refused. That is also why
 * an optional parameter belongs nowhere in this list, `formId` included - supplying
 * one would exercise a narrower path than the sweep is about.
 */
function requiredArgsFor(name: AdminApiOperationName): Record<string, unknown> {
  switch (name) {
    case 'stats_school_year_review':
      return { schoolYear: '2026-2027' };
    case 'stats_schools_churn':
      return { schoolYear: '2026-2027', compareTo: '2025-2026' };
    case 'config_event_detail':
      // Takes an event id as its subject rather than as a filter, so it is
      // covered by the eventId sweep with no extra argument.
      return {};
    default:
      return {};
  }
}
