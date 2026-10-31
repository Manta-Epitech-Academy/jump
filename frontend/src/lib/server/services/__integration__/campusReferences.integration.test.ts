import { describe, it, expect, beforeAll } from 'vitest';
import { CAMPUS_REFERENCES } from '$lib/server/adminApi/writes/campuses';
import { loadDatamodel } from '../../../../../scripts/seed/schema';
import { assertTestDatabase } from './testDatabase';

/**
 * `write_campus` removes a campus only when nothing references it, and it
 * knows what references a campus from `CAMPUS_REFERENCES`, a list written by
 * hand. A test restating that list would pass by agreeing with it, so this one
 * asks the schema: every relation field `Campus` declares must be counted. A
 * new table pointing at a campus fails here until it is, instead of being
 * cascaded or orphaned by a removal that believed the campus was empty.
 */
describe('the campus removal counts every reference', () => {
  beforeAll(() => {
    assertTestDatabase();
  });

  it('names every relation field of Campus', async () => {
    const datamodel = await loadDatamodel();
    const campus = datamodel.models.find((m) => m.name === 'Campus')!;
    const relations = campus.fields
      .filter((f) => f.kind === 'object')
      .map((f) => f.name)
      .sort();
    expect(Object.keys(CAMPUS_REFERENCES).sort()).toEqual(relations);
  });
});
