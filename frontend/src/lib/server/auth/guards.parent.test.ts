import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { applyRouteGuards } from './guards';
import { prisma } from '$lib/server/db';

vi.mock('$lib/server/db', () => ({
  prisma: { talent: { count: vi.fn() } },
}));

/**
 * The guardian's flow: welcome, règlement, signature while a child is pending,
 * merci once nothing is. The guard decides on the matched route id, so each
 * case names the route the router would match for its path; the pending count
 * is the one database read, mocked.
 */
function eventFor(
  page: string,
  user: { role: string; email?: string } | null,
  path = `/parent/${page}`,
): RequestEvent {
  return {
    url: new URL(`http://localhost${path}`),
    route: { id: `/(parent)/parent/${page}` },
    locals: { talent: null, staffProfile: null, user },
  } as unknown as RequestEvent;
}

const guardian = { role: 'parent', email: 'parent@example.com' };

const locationOf = (r: Response | null) =>
  r ? new URL(r.headers.get('location') ?? '').pathname : null;

const pending = (count: number) =>
  vi.mocked(prisma.talent.count).mockResolvedValue(count);

beforeEach(() => vi.mocked(prisma.talent.count).mockReset());

describe('parent route guards: who reaches the flow', () => {
  it('sends a visitor with no session to the login', async () => {
    const res = await applyRouteGuards(eventFor('welcome', null));
    expect(locationOf(res)).toBe('/login');
  });

  it('sends a student session to the login, not into the flow', async () => {
    const res = await applyRouteGuards(
      eventFor('welcome', { role: 'student' }),
    );
    expect(locationOf(res)).toBe('/login');
  });

  it('lets a visitor reach the magic-link endpoint', async () => {
    // It forges the session itself: bounced to the login, it would never run.
    expect(await applyRouteGuards(eventFor('fastlogin', null))).toBeNull();
  });
});

describe('parent route guards: a guardian inside the flow', () => {
  it('keeps a guardian with a pending child on the flow pages', async () => {
    pending(1);
    for (const page of ['welcome', 'reglement', 'signature']) {
      expect(await applyRouteGuards(eventFor(page, guardian))).toBeNull();
    }
  });

  it('decides on the route, not on how its path is spelled', async () => {
    // `%77elcome` matches the welcome route while its pathname does not.
    pending(1);
    const res = await applyRouteGuards(
      eventFor('welcome', guardian, '/parent/%77elcome'),
    );
    expect(res).toBeNull();
  });

  it('sends a guardian with a pending child back from merci', async () => {
    pending(1);
    const res = await applyRouteGuards(eventFor('merci', guardian));
    expect(locationOf(res)).toBe('/parent/welcome');
  });

  it('lands a guardian with nothing pending on merci', async () => {
    pending(0);
    const res = await applyRouteGuards(eventFor('welcome', guardian));
    expect(locationOf(res)).toBe('/parent/merci');
  });

  it('sends a signed-in guardian off the login page into the flow', async () => {
    pending(1);
    const res = await applyRouteGuards(eventFor('login', guardian));
    expect(locationOf(res)).toBe('/parent/welcome');
  });
});
