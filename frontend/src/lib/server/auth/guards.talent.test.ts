import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { applyRouteGuards } from './guards';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';

/**
 * Where the talent funnel sends someone who does not walk the onboarding
 * ladder. Taking collégiens out of the wizard also takes the RGPD charte with
 * it, since the wizard is the only other place it is signed, so `/charte` is a
 * path this phase creates from nothing and nothing else covers.
 *
 * The guard reads three things off the event, so a literal is enough here: no
 * database, no session, just the routing decision.
 */
function eventFor(
  talent: Record<string, unknown> | null,
  path: string,
): RequestEvent {
  return {
    url: new URL(`http://localhost${path}`),
    route: { id: '/(talent)/whatever' },
    locals: { talent, user: talent ? { id: 'u1', role: 'student' } : null },
  } as unknown as RequestEvent;
}

/** A talent past the welcome splash, so that guard never fires first. */
function talent(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    niveau: '2nde',
    welcomeSeenAt: new Date(),
    charterAcceptedAt: null,
    onboardingSchoolYear: null,
    infoValidatedAt: null,
    highSchoolValidatedAt: null,
    parentsValidatedAt: null,
    techInterestsValidatedAt: null,
    generalInterestsValidatedAt: null,
    equipmentValidatedAt: null,
    processingCompletedAt: null,
    rulesSignedAt: null,
    ...over,
  };
}

const locationOf = (r: Response | null) =>
  r ? new URL(r.headers.get('location') ?? '').pathname : null;

describe('talent route guards: who walks the ladder', () => {
  it('sends a collégien to the charte, never to the wizard', async () => {
    const res = await applyRouteGuards(
      eventFor(talent({ niveau: '4eme' }), '/'),
    );
    expect(locationOf(res)).toBe('/charte');
  });

  it('bounces a collégien out of the wizard', async () => {
    // Without this they would sit on step 1 for good: the onboarding guard no
    // longer advances them, so nothing else would move them off the page.
    const res = await applyRouteGuards(
      eventFor(talent({ niveau: '6eme' }), '/onboarding'),
    );
    expect(locationOf(res)).toBe('/');
  });

  it('still sends a lycéen through the wizard', async () => {
    const res = await applyRouteGuards(
      eventFor(talent({ niveau: '2nde' }), '/'),
    );
    expect(locationOf(res)).toBe('/onboarding');
  });

  it('lets a collégien reach the charte page itself', async () => {
    const res = await applyRouteGuards(
      eventFor(talent({ niveau: '3eme' }), '/charte'),
    );
    expect(res).toBeNull();
  });

  it('lets a collégien through once the charte is accepted', async () => {
    const res = await applyRouteGuards(
      eventFor(talent({ niveau: '5eme', charterAcceptedAt: new Date() }), '/'),
    );
    expect(res).toBeNull();
  });

  it('keeps a settled collégien off the charte page', async () => {
    const res = await applyRouteGuards(
      eventFor(
        talent({ niveau: '5eme', charterAcceptedAt: new Date() }),
        '/charte',
      ),
    );
    expect(locationOf(res)).toBe('/');
  });

  it('treats an unknown level as a lycéen (fail open)', async () => {
    const res = await applyRouteGuards(eventFor(talent({ niveau: null }), '/'));
    expect(locationOf(res)).toBe('/onboarding');
  });
});

/**
 * The dossier is per school year, so clearing it once is not clearing it for
 * good. What makes a returning talent walk the wizard again is the stamp on the
 * projection, not the timestamps: those still hold last year's dossier, and a
 * guard reading them straight would wave the talent through on a règlement they
 * signed for a year that is over.
 */
describe('talent route guards: the dossier is per school year', () => {
  const currentYear = currentSchoolYearLabel();
  const lastYear = `${Number(currentYear.slice(0, 4)) - 1}-${currentYear.slice(0, 4)}`;

  /** Every gate set, as a talent who finished the wizard carries them. */
  const finished = {
    charterAcceptedAt: new Date(),
    infoValidatedAt: new Date(),
    highSchoolValidatedAt: new Date(),
    parentsValidatedAt: new Date(),
    techInterestsValidatedAt: new Date(),
    generalInterestsValidatedAt: new Date(),
    equipmentValidatedAt: new Date(),
    processingCompletedAt: new Date(),
    rulesSignedAt: new Date(),
  };

  it('lets a talent whose dossier is this year straight through', async () => {
    const res = await applyRouteGuards(
      eventFor(talent({ ...finished, onboardingSchoolYear: currentYear }), '/'),
    );
    expect(res).toBeNull();
  });

  it('sends a talent whose dossier is last year back to the wizard', async () => {
    const res = await applyRouteGuards(
      eventFor(talent({ ...finished, onboardingSchoolYear: lastYear }), '/'),
    );
    expect(locationOf(res)).toBe('/onboarding');
  });

  it('moves a returning talent off the charte instead of re-asking it', async () => {
    // The charte is a once-per-account consent, not part of the yearly dossier.
    // A returning talent who lands on `/charte` has nothing to sign there, and
    // the page they do owe something to is the wizard - so the onboarding guard
    // is the one that must answer, not the charte guard sending them home.
    const res = await applyRouteGuards(
      eventFor(
        talent({ ...finished, onboardingSchoolYear: lastYear }),
        '/charte',
      ),
    );
    expect(locationOf(res)).toBe('/onboarding');
  });

  it('does not re-show the welcome splash to a returning talent', async () => {
    // `welcomeSeenAt` is once per account too. Without that, the returning
    // talent would be bounced to the splash instead of the wizard, since the
    // welcome guard runs first and fires on "still has onboarding to do".
    const res = await applyRouteGuards(
      eventFor(
        talent({
          ...finished,
          welcomeSeenAt: new Date(),
          onboardingSchoolYear: lastYear,
        }),
        '/',
      ),
    );
    expect(locationOf(res)).toBe('/onboarding');
  });
});
