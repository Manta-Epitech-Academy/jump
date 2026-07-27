import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '$lib/server/db';

vi.mock('$lib/server/db', () => ({
  prisma: {
    campus: { findFirst: vi.fn(), findMany: vi.fn() },
    event: { findUnique: vi.fn() },
  },
}));

const { resolveScope, assertKnownSchoolYear, UnknownScopeError } =
  await import('./scope');

const campusFindFirst = vi.mocked(prisma.campus.findFirst);
const campusFindMany = vi.mocked(prisma.campus.findMany);
const eventFindUnique = vi.mocked(prisma.event.findUnique);

beforeEach(() => {
  campusFindFirst.mockReset();
  campusFindMany.mockReset();
  eventFindUnique.mockReset();
});

describe('resolveScope', () => {
  it('resolves a campus by name, case-insensitively', async () => {
    campusFindFirst.mockResolvedValue({
      id: 'cmp_lille',
      name: 'Lille',
    } as never);

    const scope = await resolveScope({ campus: 'lille' });

    expect(scope.campus).toEqual({ id: 'cmp_lille', name: 'Lille' });
    expect(campusFindFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'lille', mode: 'insensitive' } },
      select: { id: true, name: true },
    });
  });

  // The whole point of this layer: an unknown campus must not become an answer
  // of zero that reads like a fact.
  it('refuses an unknown campus and names the ones that exist', async () => {
    campusFindFirst.mockResolvedValue(null as never);
    campusFindMany.mockResolvedValue([
      { name: 'Lille' },
      { name: 'Nantes' },
    ] as never);

    const promise = resolveScope({ campus: 'Lile' });

    await expect(promise).rejects.toBeInstanceOf(UnknownScopeError);
    await expect(promise).rejects.toThrow('Lile');
    await expect(promise).rejects.toThrow('Lille, Nantes');
  });

  it('refuses an event id that does not exist', async () => {
    eventFindUnique.mockResolvedValue(null as never);

    await expect(resolveScope({ eventId: 'evt_nope' })).rejects.toBeInstanceOf(
      UnknownScopeError,
    );
  });

  it('labels a resolved event by its public name, falling back to the SF title', async () => {
    eventFindUnique.mockResolvedValue({
      id: 'evt_1',
      titre: 'Lille-12-02-2026-CodingClub',
      publicName: 'Coding Club février',
    } as never);
    expect((await resolveScope({ eventId: 'evt_1' })).event).toEqual({
      id: 'evt_1',
      label: 'Coding Club février',
    });

    eventFindUnique.mockResolvedValue({
      id: 'evt_2',
      titre: 'Lille-12-02-2026-CodingClub',
      publicName: null,
    } as never);
    expect((await resolveScope({ eventId: 'evt_2' })).event?.label).toBe(
      'Lille-12-02-2026-CodingClub',
    );
  });

  it('touches no table when nothing is scoped', async () => {
    expect(await resolveScope()).toEqual({
      schoolYear: undefined,
      campus: undefined,
      event: undefined,
    });
    expect(campusFindFirst).not.toHaveBeenCalled();
    expect(eventFindUnique).not.toHaveBeenCalled();
  });
});

describe('assertKnownSchoolYear', () => {
  it('accepts a year that has events, and no year at all', () => {
    expect(() =>
      assertKnownSchoolYear('2026-2027', ['2026-2027', '2025-2026']),
    ).not.toThrow();
    expect(() => assertKnownSchoolYear(undefined, ['2026-2027'])).not.toThrow();
  });

  // "2099-2100" passes the format regex, so only this check stops it from
  // reporting zeros as if they were real.
  it('refuses a well-formed year with no event, listing the real ones', () => {
    expect(() =>
      assertKnownSchoolYear('2099-2100', ['2026-2027', '2025-2026']),
    ).toThrow(UnknownScopeError);
    expect(() =>
      assertKnownSchoolYear('2099-2100', ['2026-2027', '2025-2026']),
    ).toThrow('2026-2027, 2025-2026');
  });
});
