/**
 * What leaves for Umami, decided at the moment it leaves (#518).
 *
 * The tracker posts pageviews on its own and remembers the last identity it was
 * given for as long as the tab lives, so the two promises only hold if the
 * send hook enforces them on every payload: an objector sends nothing, a talent
 * sends no id whatever the tracker remembers, and staff send their own.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

type Hook = (
  type: string,
  payload: Record<string, unknown>,
) => Record<string, unknown> | null;

let hook: Hook;
let setAnalyticsSubject: typeof import('./analytics').setAnalyticsSubject;

beforeAll(async () => {
  vi.stubGlobal('window', {});
  const analytics = await import('./analytics');
  setAnalyticsSubject = analytics.setAnalyticsSubject;
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
