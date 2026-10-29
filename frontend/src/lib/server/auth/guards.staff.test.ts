import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { applyRouteGuards } from './guards';

/**
 * The admin and dev sub-guards must key on the matched route, not on
 * event.url.pathname. SvelteKit routes on the decoded path, so
 * `/staff/%61dmin/users` resolves to the admin route, while url.pathname keeps
 * `%61dmin`. A pathname prefix compare reads that as non-admin and skips the
 * sub-guard, letting a dev or parent reach admin actions. The guard reads the
 * route id and the session off the event, so a literal event is enough: no
 * database, no real session.
 */
function eventFor(
  routeId: string,
  path: string,
  locals: Record<string, unknown>,
): RequestEvent {
  return {
    url: new URL(`http://localhost${path}`),
    route: { id: routeId },
    locals: { talent: null, ...locals },
  } as unknown as RequestEvent;
}

const dev = {
  user: { id: 'u1', role: 'staff' },
  staffProfile: { staffRole: 'dev' },
};
const admin = {
  user: { id: 'u2', role: 'staff' },
  staffProfile: { staffRole: 'admin' },
};
const parent = { user: { id: 'u3', role: 'parent' }, staffProfile: null };

const locationOf = (r: Response | null) =>
  r ? new URL(r.headers.get('location') ?? '').pathname : null;

describe('staff route guards: encoded path cannot skip the admin sub-guard', () => {
  it('redirects a dev off the plain admin path', async () => {
    const res = await applyRouteGuards(
      eventFor('/(staff)/staff/admin/users', '/staff/admin/users', dev),
    );
    expect(locationOf(res)).toBe('/staff/login');
  });

  it('redirects a dev off the percent-encoded admin path', async () => {
    const res = await applyRouteGuards(
      eventFor('/(staff)/staff/admin/users', '/staff/%61dmin/users', dev),
    );
    expect(locationOf(res)).toBe('/staff/login');
  });

  it('redirects a parent off the percent-encoded admin path', async () => {
    const res = await applyRouteGuards(
      eventFor('/(staff)/staff/admin/users', '/staff/%61dmin/users', parent),
    );
    expect(locationOf(res)).toBe('/staff/login');
  });

  it('still lets an admin through the percent-encoded admin path', async () => {
    const res = await applyRouteGuards(
      eventFor('/(staff)/staff/admin/users', '/staff/%61dmin/users', admin),
    );
    expect(res).toBeNull();
  });

  it('redirects a parent off the percent-encoded dev path', async () => {
    const res = await applyRouteGuards(
      eventFor(
        '/(staff)/staff/dev/participants',
        '/staff/%64ev/participants',
        parent,
      ),
    );
    expect(locationOf(res)).toBe('/staff/login');
  });

  it('still lets a dev through the percent-encoded dev path', async () => {
    const res = await applyRouteGuards(
      eventFor(
        '/(staff)/staff/dev/participants',
        '/staff/%64ev/participants',
        dev,
      ),
    );
    expect(res).toBeNull();
  });
});
