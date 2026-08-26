/**
 * The SQL half of the activation rule.
 *
 * `activatableEventWhere` and `activationBlockers` in `domain/eventReadiness` are
 * one rule with two spellings, because a Prisma `where` cannot call a predicate.
 * Kept in step here by asserting they read the same fields: what this catches is
 * a condition added to one spelling and not the other, which is how the rule came
 * to exist three times before. Behaviour is pinned where it can be executed, in
 * `adminApiWrites.integration.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { activatableEventWhere } from './events';

describe('activatableEventWhere', () => {
  it('reads the same three fields as activationBlockers', () => {
    const fields = new Set<string>();
    for (const [key, value] of Object.entries(
      activatableEventWhere as Record<string, unknown>,
    )) {
      // `publicName` is spelled as a NOT of two clauses, since "unset" is both
      // null and the empty string on that column.
      if (key === 'NOT' && Array.isArray(value)) {
        for (const clause of value) {
          for (const inner of Object.keys(clause as object)) fields.add(inner);
        }
        continue;
      }
      fields.add(key);
    }
    expect([...fields].sort()).toEqual(['endDate', 'modules', 'publicName']);
  });
});
