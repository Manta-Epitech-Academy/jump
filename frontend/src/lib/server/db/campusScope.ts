import type { Prisma } from '@prisma/client';

/**
 * What the dev workspace's campus-scoped client (`scopedPrisma`) does to a
 * query before it runs: the rule, as data, with no client in reach so a unit
 * test can read every case.
 *
 * One table names each model the dev workspace may reach and the filter that
 * keeps it to one campus. Every operation is put in one of four kinds by a
 * second table that the compiler holds to Prisma's own list of operations, so
 * a new operation fails `tsc` here instead of running unscoped. Anything
 * outside the two tables is refused: a model with no entry, a raw query, an
 * operation with no kind. A model the table leaves out is read with `prisma`
 * where it is read, scoped there by hand if it needs it: a global catalogue
 * (workshops, diploma templates, feedback forms, schools, interests), an
 * admin-only table (usage, sync, the admin API's own), or a row a talent reaches
 * by their own id (a QR self-check-in has no staff campus).
 *
 * It used to be the reverse. `scoped.ts` held one hand-written handler per
 * model and operation, and an operation without a handler ran on every campus,
 * silently: `participation.count` and `eventPresenceClosure.findUnique` did
 * until 68cef56e, `onboarding_Record.findMany` did until this table. Its
 * `upsert` checked only the event of the row it would create, so a `where`
 * naming another campus's row updated that row, and no update was kept from
 * moving a row to another campus.
 */

type Where = Record<string, unknown>;

/**
 * How a model is tied to a campus.
 *   - `where`: the filter that keeps a row to one campus. It goes into every
 *     operation's `where`, unique ones included (a `WhereUniqueInput` takes an
 *     `AND`), so a row of another campus reads as not found, and is never
 *     updated or deleted.
 *   - `owners`: the `data` keys that tie a row to its campus. No write sets
 *     them: an update that did would move the row out of the campus.
 *   - `create`: `eventOnCampus` admits a create whose `eventId` is an event of
 *     the campus, checked by the client before it runs; `refuse` admits none,
 *     because the dev workspace creates none of these rows (the sync, the
 *     onboarding services and the admin do, on the plain client).
 */
interface ModelScope {
  where: (campusId: string) => Where;
  owners: readonly string[];
  create: 'eventOnCampus' | 'refuse';
}

const onCampus = (campusId: string): Where => ({ campusId });
const throughEvent = (campusId: string): Where => ({ event: { campusId } });
const throughEnrolment = (campusId: string): Where => ({
  participations: { some: { campusId } },
});

const ON_CAMPUS = {
  where: onCampus,
  owners: ['campusId', 'campus'],
  create: 'refuse',
} as const;
const ENROLMENT_ROW = {
  where: onCampus,
  owners: ['campusId', 'campus', 'eventId', 'event'],
  create: 'refuse',
} as const;
const EVENT_ROW = {
  where: throughEvent,
  owners: ['eventId', 'event'],
  create: 'eventOnCampus',
} as const;

export const CAMPUS_SCOPE = {
  Event: ON_CAMPUS,
  StaffProfile: ON_CAMPUS,
  Participation: ENROLMENT_ROW,
  Closing_Record: ENROLMENT_ROW,
  // A talent belongs to every campus they enrolled on, and to no other.
  Talent: {
    where: throughEnrolment,
    owners: ['participations'],
    create: 'refuse',
  },
  Onboarding_Record: {
    where: (campusId) => ({ talent: throughEnrolment(campusId) }),
    owners: ['talentId', 'talent'],
    create: 'refuse',
  },
  EventPresence: EVENT_ROW,
  EventPresenceClosure: EVENT_ROW,
  Planning_Slot: EVENT_ROW,
} as const satisfies Partial<Record<Prisma.ModelName, ModelScope>>;

export type ScopedModel = keyof typeof CAMPUS_SCOPE;

type ModelOperation = keyof Prisma.TypeMap['model']['Event']['operations'];

/**
 * `filter`: the campus goes into `where`. `update`: the same, and `data` may
 * not set an owner. `upsert`: both, plus the `create` branch's policy.
 * `create`: the model's create policy alone.
 */
type OperationKind = 'filter' | 'update' | 'upsert' | 'create';

const OPERATION_KIND = {
  findUnique: 'filter',
  findUniqueOrThrow: 'filter',
  findFirst: 'filter',
  findFirstOrThrow: 'filter',
  findMany: 'filter',
  count: 'filter',
  aggregate: 'filter',
  groupBy: 'filter',
  delete: 'filter',
  deleteMany: 'filter',
  update: 'update',
  updateMany: 'update',
  updateManyAndReturn: 'update',
  upsert: 'upsert',
  create: 'create',
  createMany: 'create',
  createManyAndReturn: 'create',
} as const satisfies Record<ModelOperation, OperationKind>;

/** A query the campus-scoped client must not run. A bug, never a user error. */
export class CampusScopeViolation extends Error {
  override name = 'CampusScopeViolation';
}

export type ScopedQuery = {
  args: Record<string, unknown>;
  /** Events a create names, which the client checks are on the campus. */
  eventIds: string[];
};

const hasOwn = <T extends object>(o: T, key: PropertyKey): key is keyof T =>
  Object.prototype.hasOwnProperty.call(o, key);

/**
 * `where` with the campus filter added to its `AND`. Never spread over the
 * caller's own filter: a caller filtering on `talent` or with an `AND` of its
 * own would otherwise lose it to the campus filter.
 */
export function withScope(where: unknown, scope: Where): Where {
  const own = (where ?? {}) as Where;
  const and = own.AND === undefined ? [] : [own.AND].flat();
  return { ...own, AND: [...and, scope] };
}

export function planScopedQuery(
  campusId: string,
  model: string | undefined,
  operation: string,
  args: Record<string, unknown> | undefined,
): ScopedQuery {
  if (!model || !hasOwn(CAMPUS_SCOPE, model)) {
    throw new CampusScopeViolation(
      `${model ?? `$${operation}`} cannot be reached through the campus-scoped client: read it with \`prisma\` and scope it by hand, or give it an entry in CAMPUS_SCOPE`,
    );
  }
  if (!hasOwn(OPERATION_KIND, operation)) {
    throw new CampusScopeViolation(
      `${model}.${operation} has no campus rule in OPERATION_KIND`,
    );
  }
  const scope: ModelScope = CAMPUS_SCOPE[model];
  const scoped = { ...(args ?? {}) };
  const kind = OPERATION_KIND[operation];

  if (kind !== 'create')
    scoped.where = withScope(scoped.where, scope.where(campusId));
  if (kind === 'update') refuseOwners(model, scope, scoped.data);
  if (kind === 'upsert') refuseOwners(model, scope, scoped.update);
  const eventIds =
    kind === 'create' || kind === 'upsert'
      ? createdEventIds(
          model,
          scope,
          kind === 'create' ? scoped.data : scoped.create,
        )
      : [];
  return { args: scoped, eventIds };
}

function refuseOwners(model: string, scope: ModelScope, data: unknown): void {
  const set = scope.owners.filter((key) => hasOwn((data ?? {}) as Where, key));
  if (set.length > 0) {
    throw new CampusScopeViolation(
      `${model}: a write through the campus-scoped client may not set ${set.join(', ')}`,
    );
  }
}

function createdEventIds(
  model: string,
  scope: ModelScope,
  data: unknown,
): string[] {
  if (scope.create === 'refuse') {
    throw new CampusScopeViolation(
      `${model} is never created through the campus-scoped client`,
    );
  }
  const rows = [data ?? []].flat() as Where[];
  const ids = rows.map((row) => row.eventId);
  if (rows.some((row) => hasOwn(row, 'event')) || !ids.every(isString)) {
    throw new CampusScopeViolation(
      `${model}: a create through the campus-scoped client names its event by \`eventId\``,
    );
  }
  return [...new Set(ids)];
}

const isString = (v: unknown): v is string => typeof v === 'string';
