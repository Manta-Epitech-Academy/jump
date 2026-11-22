/**
 * What leaves for Umami, decided at the moment it leaves (#518).
 *
 * The tracker posts pageviews on its own and remembers the last identity it was
 * given for as long as the tab lives, so the two promises only hold if the
 * send hook enforces them on every payload: an objector sends nothing, a talent
 * sends no id whatever the tracker remembers, and staff send their own.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('$app/env', () => ({ browser: true }));

type Hook = (
  type: string,
  payload: Record<string, unknown>,
) => Record<string, unknown> | null;

let hook: Hook;
let setAnalyticsSubject: typeof import('./analytics').setAnalyticsSubject;
let analyticsIdentity: typeof import('./analytics').analyticsIdentity;

beforeAll(async () => {
  vi.stubGlobal('window', {});
  const analytics = await import('./analytics');
  setAnalyticsSubject = analytics.setAnalyticsSubject;
  analyticsIdentity = analytics.analyticsIdentity;
  hook = (window as unknown as Record<string, Hook>)[
    analytics.UMAMI_BEFORE_SEND
  ];
});

const pageview = { website: 'w', url: '/home', id: 'stale_staff_id' };

describe('the Umami send hook', () => {
  it('sends nothing for a talent who objected', () => {
    setAnalyticsSubject({ measured: false });
    expect(hook('event', pageview)).toBeNull();
  });

  it('strips the id the tracker remembers when the subject carries none', () => {
    setAnalyticsSubject({ measured: true });
    expect(hook('event', pageview)).toEqual({ website: 'w', url: '/home' });
  });

  it("replaces it with the staff member's own", () => {
    setAnalyticsSubject({ measured: true, distinctId: 'staff_1' });
    expect(hook('event', pageview)).toEqual({ ...pageview, id: 'staff_1' });
  });
});

/**
 * Who the layout hands that hook, read off the page data. The hook only
 * enforces the subject it is given, so these are the rules themselves: put a
 * talent's id back here, or measure an objector, and nothing above notices.
 */
describe('the subject a page is measured as', () => {
  const objected = {
    id: 'talent_2',
    usageAnalyticsOptOutAt: '2026-11-01T00:00:00Z',
  };
  const talent = { id: 'talent_1', usageAnalyticsOptOutAt: null };
  const staffProfile = {
    id: 'staff_1',
    staffRole: 'dev',
    campus: { name: 'Lille' },
  };
  const impersonator = {
    userId: 'user_admin',
    staffProfileId: 'staff_admin',
    staffRole: 'admin',
    campusName: 'Paris',
    email: 'admin@example.fr',
  };

  it('measures a talent with no id and no email', () => {
    expect(
      analyticsIdentity({
        user: { email: 'lea@example.fr' },
        talent,
        talentCampusName: 'Lille',
      }),
    ).toEqual({
      subject: { measured: true },
      properties: { account_type: 'talent', role: null, campus: 'Lille' },
    });
  });

  it('does not measure a talent who objected, nor identify them', () => {
    expect(analyticsIdentity({ talent: objected })).toEqual({
      subject: { measured: false },
      properties: null,
    });
  });

  it('identifies staff by their profile id', () => {
    expect(
      analyticsIdentity({ user: { email: 'dev@example.fr' }, staffProfile }),
    ).toEqual({
      subject: { measured: true, distinctId: 'staff_1' },
      properties: {
        account_type: 'staff',
        role: 'dev',
        campus: 'Lille',
        email: 'dev@example.fr',
      },
    });
  });

  it("measures the admin acting as a talent, objector or not, without the talent's id", () => {
    for (const target of [talent, objected]) {
      expect(analyticsIdentity({ impersonator, talent: target })).toEqual({
        subject: { measured: true, distinctId: 'staff_admin' },
        properties: {
          account_type: 'staff',
          role: 'admin',
          campus: 'Paris',
          email: 'admin@example.fr',
          impersonating: 'talent',
          impersonating_target_id: null,
        },
      });
    }
  });

  it('names the member of staff an admin acts as', () => {
    expect(
      analyticsIdentity({ impersonator, staffProfile }).properties,
    ).toMatchObject({
      impersonating: 'staff',
      impersonating_target_id: 'staff_1',
    });
  });

  it('measures an anonymous visitor without identifying them', () => {
    expect(analyticsIdentity({})).toEqual({
      subject: { measured: true },
      properties: null,
    });
  });
});
