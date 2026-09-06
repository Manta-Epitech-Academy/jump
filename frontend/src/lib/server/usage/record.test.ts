import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '$lib/server/db';
import { USAGE_FEATURES } from '$lib/domain/usage';

vi.mock('$lib/server/db', () => ({
  prisma: { usage_FeatureUse: { createMany: vi.fn() } },
}));

const dynamicEnv: Record<string, string | undefined> = { USAGE_SALT: 'pepper' };
vi.mock('$env/dynamic/private', () => ({ env: dynamicEnv }));

const { recordUsage } = await import('./record');

const createMany = vi.mocked(prisma.usage_FeatureUse.createMany);

beforeEach(() => {
  createMany.mockReset();
  createMany.mockResolvedValue({ count: 1 });
  dynamicEnv.USAGE_SALT = 'pepper';
});

afterEach(() => {
  vi.useRealTimers();
});

/** The single row a call produced, or null when it produced none. */
function written() {
  if (createMany.mock.calls.length === 0) return null;
  const arg = createMany.mock.calls[0][0] as {
    data: Record<string, unknown>[];
  };
  return arg.data[0];
}

const staffLocals = (over: Record<string, unknown> = {}) =>
  ({
    session: { id: 'sess-1' },
    staffProfile: { id: 'staff-1', campusId: 'campus-1' },
    talent: null,
    talentCampusId: null,
    impersonator: null,
    ...over,
  }) as unknown as App.Locals;

const talentLocals = (over: Record<string, unknown> = {}) =>
  ({
    session: { id: 'sess-t' },
    staffProfile: null,
    talent: { id: 'talent-1', usageAnalyticsOptOutAt: null },
    talentCampusId: 'campus-1',
    impersonator: null,
    ...over,
  }) as unknown as App.Locals;

describe('recordUsage', () => {
  it('never throws when the write fails', async () => {
    createMany.mockRejectedValue(new Error('db down'));
    expect(() =>
      recordUsage(USAGE_FEATURES.DEV_INSCRITS_EXPORT, {
        locals: staffLocals(),
        eventId: 'event-1',
      }),
    ).not.toThrow();
    // The rejection is swallowed inside the recorder, so nothing surfaces here.
    await Promise.resolve();
  });

  it('identifies a staff member and stamps their campus and event', () => {
    recordUsage(USAGE_FEATURES.DEV_INSCRITS_EXPORT, {
      locals: staffLocals(),
      eventId: 'event-1',
    });
    expect(written()).toMatchObject({
      feature: 'dev_inscrits_export',
      actorKind: 'staff',
      staffProfileId: 'staff-1',
      actorHash: null,
      campusId: 'campus-1',
      eventId: 'event-1',
      impersonated: false,
      dedupeKey: null, // an export is `each`
    });
  });

  it('stamps neither campus nor event on a global-scope feature', () => {
    recordUsage(USAGE_FEATURES.ADMIN_USER_INVITE, { locals: staffLocals() });
    expect(written()).toMatchObject({ campusId: null, eventId: null });
  });

  it('pseudonymises a talent and never writes their id', () => {
    recordUsage(USAGE_FEATURES.TALENT_MINIGAME_OPEN, {
      locals: talentLocals(),
    });
    const row = written();
    expect(row).toMatchObject({ actorKind: 'talent', staffProfileId: null });
    expect(row?.actorHash).toMatch(/^[0-9a-f]{64}$/);
    // The whole point: nothing in the row leads back to the person.
    expect(JSON.stringify(row)).not.toContain('talent-1');
  });

  it('rotates the pseudonym monthly, so it cannot follow someone across months', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T10:00:00Z'));
    recordUsage(USAGE_FEATURES.TALENT_MINIGAME_OPEN, {
      locals: talentLocals(),
    });
    const august = written()?.actorHash;
    createMany.mockClear();
    vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
    recordUsage(USAGE_FEATURES.TALENT_MINIGAME_OPEN, {
      locals: talentLocals(),
    });
    expect(written()?.actorHash).not.toBe(august);
  });

  it('records nothing for a talent when the salt is unset', () => {
    dynamicEnv.USAGE_SALT = undefined;
    recordUsage(USAGE_FEATURES.TALENT_MINIGAME_OPEN, {
      locals: talentLocals(),
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('still records staff when the salt is unset, since no hash is involved', () => {
    dynamicEnv.USAGE_SALT = undefined;
    recordUsage(USAGE_FEATURES.ADMIN_USER_INVITE, { locals: staffLocals() });
    expect(createMany).toHaveBeenCalledOnce();
  });

  it('records nothing for a talent who has objected', () => {
    recordUsage(USAGE_FEATURES.TALENT_MINIGAME_OPEN, {
      locals: talentLocals({
        talent: { id: 'talent-1', usageAnalyticsOptOutAt: new Date() },
      }),
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('records nothing on a talent surface under impersonation', () => {
    recordUsage(USAGE_FEATURES.TALENT_MINIGAME_OPEN, {
      locals: talentLocals({
        session: { id: 'sess-t', impersonatedBy: 'admin-user' },
      }),
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('attributes an impersonated staff surface to the real admin', () => {
    recordUsage(USAGE_FEATURES.DEV_INSCRITS_EXPORT, {
      locals: staffLocals({
        session: { id: 'sess-1', impersonatedBy: 'admin-user' },
        staffProfile: { id: 'victim-profile', campusId: 'campus-9' },
        impersonator: { staffProfileId: 'admin-profile' },
      }),
      eventId: 'event-1',
    });
    expect(written()).toMatchObject({
      staffProfileId: 'admin-profile',
      impersonated: true,
      // Not the explored campus: an admin looking around must not read as that
      // campus adopting the feature.
      campusId: null,
    });
  });

  it('records nothing when the actor cannot be resolved at all', () => {
    recordUsage(USAGE_FEATURES.ADMIN_USER_INVITE, {
      locals: staffLocals({ staffProfile: null }),
    });
    expect(createMany).not.toHaveBeenCalled();
  });
});

/**
 * The three collisions below are the whole reason `dedupeKey` is composed rather
 * than being a bare timestamp slice. Only `feature` and `dedupeKey` are in the
 * unique constraint, so anything else that distinguishes two legitimate rows has
 * to be inside the key or one of the two rows is silently dropped by
 * `skipDuplicates`. Each of these three was a real way to lose data.
 */
describe('the composed dedupe key', () => {
  const keyFor = (locals: App.Locals, eventId?: string) => {
    createMany.mockClear();
    recordUsage(USAGE_FEATURES.DEV_EMARGEMENT_VIEW, { locals, eventId });
    return written()?.dedupeKey;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T10:00:00Z'));
  });

  it('separates two people in the same slice', () => {
    const a = keyFor(staffLocals(), 'event-1');
    const b = keyFor(
      staffLocals({ staffProfile: { id: 'staff-2', campusId: 'campus-1' } }),
      'event-1',
    );
    expect(a).not.toBe(b);
  });

  it('separates two events for the same person in the same slice', () => {
    const a = keyFor(staffLocals(), 'event-1');
    const b = keyFor(staffLocals(), 'event-2');
    expect(a).not.toBe(b);
  });

  it('separates an impersonated use from the admin’s own', () => {
    const own = keyFor(staffLocals(), 'event-1');
    const impersonated = keyFor(
      staffLocals({
        session: { id: 'sess-1', impersonatedBy: 'admin-user' },
        impersonator: { staffProfileId: 'staff-1' },
      }),
      'event-1',
    );
    expect(own).not.toBe(impersonated);
  });

  it('collapses the same person, feature and event within one slice', () => {
    const first = keyFor(staffLocals(), 'event-1');
    vi.setSystemTime(new Date('2026-08-15T10:29:00Z'));
    expect(keyFor(staffLocals(), 'event-1')).toBe(first);
  });

  it('opens a new slice after 30 minutes', () => {
    const first = keyFor(staffLocals(), 'event-1');
    vi.setSystemTime(new Date('2026-08-15T10:31:00Z'));
    expect(keyFor(staffLocals(), 'event-1')).not.toBe(first);
  });
});

/**
 * A connection is the figure that answers "how much does this person come", so
 * the day is the unit and the four cases below are what that has to mean. The
 * key used to be `actorRef|<bauth_session id>`, which counted logins: a session
 * lives a fortnight, so somebody working daily and never signing out produced
 * about two rows a month.
 */
describe('a connection key', () => {
  const connect = (locals: App.Locals) => {
    createMany.mockClear();
    recordUsage(USAGE_FEATURES.DEV_SESSION, { locals });
    return written()?.dedupeKey;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T08:00:00Z'));
  });

  it('collapses several visits on one day into one row', () => {
    const morning = connect(staffLocals());
    vi.setSystemTime(new Date('2026-08-15T18:45:00Z'));
    expect(connect(staffLocals())).toBe(morning);
  });

  it('opens a new row on the next day', () => {
    const today = connect(staffLocals());
    vi.setSystemTime(new Date('2026-08-16T08:00:00Z'));
    expect(connect(staffLocals())).not.toBe(today);
  });

  // The day is UTC, and this is where that becomes visible: 23:59 and 00:01 are
  // one working evening on a campus east of Greenwich and two rows here. The
  // alternative is worse and is argued in `usageDedupeKey`: two of the three
  // connection keys carry no campus at all, so there is no timezone to localise
  // against.
  it('cuts the day at midnight UTC', () => {
    vi.setSystemTime(new Date('2026-08-15T23:59:00Z'));
    const before = connect(staffLocals());
    vi.setSystemTime(new Date('2026-08-16T00:01:00Z'));
    expect(connect(staffLocals())).not.toBe(before);
  });

  // The old branch skipped `impersonated` entirely and only escaped a collision
  // because BetterAuth mints a distinct session id under impersonation. Nothing
  // guaranteed that, and a day key has no such accident to rely on.
  it('separates an admin exploring a campus from their own visit', () => {
    const own = connect(staffLocals());
    const impersonated = connect(
      staffLocals({
        session: { id: 'sess-1', impersonatedBy: 'admin-user' },
        impersonator: { staffProfileId: 'staff-1' },
      }),
    );
    expect(own).not.toBe(impersonated);
  });
});
