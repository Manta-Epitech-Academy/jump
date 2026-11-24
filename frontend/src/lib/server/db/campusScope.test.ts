import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  CAMPUS_SCOPE,
  CampusScopeViolation,
  planScopedQuery,
  withScope,
} from './campusScope';

/**
 * The campus rule as data. What used to fail silently here was an operation
 * nobody had written a handler for: it ran on every campus. So the first case
 * walks every model and every operation Prisma knows.
 */

const CAMPUS = 'campus-a';
const OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'create',
  'createMany',
  'createManyAndReturn',
];
const plan = (model: string | undefined, operation: string, args = {}) =>
  planScopedQuery(CAMPUS, model, operation, args);

describe('what the campus-scoped client refuses', () => {
  it('refuses every operation on a model the rule does not list', () => {
    const unlisted = Object.values(Prisma.ModelName).filter(
      (m) => !(m in CAMPUS_SCOPE),
    );
    expect(unlisted.length).toBeGreaterThan(0);
    for (const model of unlisted) {
      for (const operation of OPERATIONS) {
        expect(() => plan(model, operation)).toThrow(CampusScopeViolation);
      }
    }
  });

  it('refuses a raw query and an operation it has no kind for', () => {
    expect(() => plan(undefined, '$queryRaw')).toThrow(CampusScopeViolation);
    expect(() => plan('Event', 'findRaw')).toThrow(CampusScopeViolation);
  });

  it('refuses a write that would move a row to another campus', () => {
    expect(() =>
      plan('Participation', 'updateMany', { data: { campusId: 'campus-b' } }),
    ).toThrow(CampusScopeViolation);
    expect(() =>
      plan('EventPresenceClosure', 'upsert', {
        where: { id: 'x' },
        create: { eventId: 'e1' },
        update: { eventId: 'e2' },
      }),
    ).toThrow(CampusScopeViolation);
    expect(() =>
      plan('Onboarding_Record', 'update', {
        where: { id: 'x' },
        data: { talent: { connect: { id: 't2' } } },
      }),
    ).toThrow(CampusScopeViolation);
  });

  it('refuses a write that sets a relation, on every model it scopes', () => {
    // An event of the campus connecting a slot by id would take in another
    // campus's slot: the campus filter never saw the slot. Each relation is
    // read off the client's schema, so this also fails if that schema stops
    // carrying them.
    for (const model of Object.keys(CAMPUS_SCOPE)) {
      const relations = Prisma.dmmf.datamodel.models
        .find((m) => m.name === model)!
        .fields.filter((f) => f.kind === 'object');
      expect(relations.length).toBeGreaterThan(0);
      for (const { name } of relations) {
        expect(() =>
          plan(model, 'updateMany', { data: { [name]: { connect: {} } } }),
        ).toThrow(CampusScopeViolation);
      }
    }
    expect(() =>
      plan('Event', 'update', {
        where: { id: 'e1' },
        data: { planningSlots: { connect: { id: 'slot-of-campus-b' } } },
      }),
    ).toThrow(CampusScopeViolation);
    expect(() =>
      plan('EventPresenceClosure', 'upsert', {
        where: { id: 'x' },
        create: { eventId: 'e1', closedBy: { connect: { id: 's2' } } },
        update: {},
      }),
    ).toThrow(CampusScopeViolation);
  });

  it('admits a write that sets columns', () => {
    expect(() =>
      plan('EventPresenceClosure', 'update', {
        where: { id: 'x' },
        data: { closedById: 's1', closedAt: new Date() },
      }),
    ).not.toThrow();
  });

  it('refuses a create the dev workspace never makes', () => {
    for (const model of [
      'Event',
      'Talent',
      'Onboarding_Record',
      'StaffProfile',
    ]) {
      expect(() => plan(model, 'create', { data: {} })).toThrow(
        CampusScopeViolation,
      );
    }
  });

  it('refuses a create that does not name its event by id', () => {
    expect(() =>
      plan('EventPresence', 'create', {
        data: { event: { connect: { id: 'e1' } } },
      }),
    ).toThrow(CampusScopeViolation);
  });
});

describe('what it adds to an admitted query', () => {
  it('puts the campus into every read, unique ones included', () => {
    for (const operation of OPERATIONS.slice(0, 10)) {
      const { args } = plan('Event', operation, { where: { id: 'e1' } });
      expect(args.where).toEqual({ id: 'e1', AND: [{ campusId: CAMPUS }] });
    }
  });

  it('keeps the caller filter next to the campus, never under it', () => {
    const where = {
      schoolYear: '2026-2027',
      talent: { participations: { some: { eventId: 'e1' } } },
      AND: [{ rulesSignedAt: { not: null } }],
    };
    const { args } = plan('Onboarding_Record', 'findMany', { where });
    expect(args.where).toEqual({
      ...where,
      AND: [
        { rulesSignedAt: { not: null } },
        { talent: { participations: { some: { campusId: CAMPUS } } } },
      ],
    });
  });

  it('names the events a create writes against, once each', () => {
    const { eventIds } = plan('EventPresence', 'createMany', {
      data: [
        { eventId: 'e1', talentId: 't1' },
        { eventId: 'e1', talentId: 't2' },
        { eventId: 'e2', talentId: 't1' },
      ],
    });
    expect(eventIds).toEqual(['e1', 'e2']);
    expect(
      plan('EventPresenceClosure', 'upsert', {
        where: { id: 'x' },
        create: { eventId: 'e3' },
        update: { closedById: 's1' },
      }).eventIds,
    ).toEqual(['e3']);
  });
});

describe('withScope', () => {
  it('reads a single AND object as a one-element list', () => {
    expect(withScope({ AND: { a: 1 } }, { b: 2 })).toEqual({
      AND: [{ a: 1 }, { b: 2 }],
    });
    expect(withScope(undefined, { b: 2 })).toEqual({ AND: [{ b: 2 }] });
  });
});
