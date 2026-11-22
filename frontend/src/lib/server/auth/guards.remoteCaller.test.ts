import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { admitCaller } from './guards';
import { currentSchoolYearLabel } from '#lib/domain/schoolYear.ts';

/**
 * The gate in front of every remote function. No route guard reaches one (a
 * `query` has no route id, a `command` names its page in a header the caller
 * writes), so this is the whole of their access control.
 */

const done = new Date();

function talent(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    niveau: '2nde',
    welcomeSeenAt: done,
    charterAcceptedAt: done,
    onboardingSchoolYear: currentSchoolYearLabel(),
    infoValidatedAt: done,
    highSchoolValidatedAt: done,
    parentsValidatedAt: done,
    techInterestsValidatedAt: done,
    generalInterestsValidatedAt: done,
    equipmentValidatedAt: done,
    processingCompletedAt: done,
    rulesSignedAt: done,
    ...over,
  };
}

function locals(over: Record<string, unknown>): App.Locals {
  return {
    user: null,
    staffProfile: null,
    talent: null,
    ...over,
  } as App.Locals;
}

const staff = (staffRole: string) =>
  locals({ user: { id: 'u1' }, staffProfile: { id: 'p1', staffRole } });

function statusOf(admit: () => unknown): number | 'admitted' {
  try {
    admit();
    return 'admitted';
  } catch (e) {
    if (isHttpError(e)) return e.status;
    throw e;
  }
}

describe('admitCaller: talent gates', () => {
  it('admits a talent the app is open to', () => {
    const caller = admitCaller(
      { talent: 'appOpen' },
      locals({ talent: talent() }),
    );
    expect(caller.talent.id).toBe('t1');
  });

  it('refuses the app to a talent who has not signed the charte', () => {
    // A collégien walks no dossier, so the charte is the only gate in front of
    // them: the case a check on the dossier alone lets through.
    expect(
      statusOf(() =>
        admitCaller(
          { talent: 'appOpen' },
          locals({
            talent: talent({ niveau: '4eme', charterAcceptedAt: null }),
          }),
        ),
      ),
    ).toBe(403);
  });

  it('refuses the app to a talent the welcome splash is still due to', () => {
    // A collégien's dossier never closes, so only the splash stands between a
    // signed charte and the app: the page guards send them to `/welcome`, and
    // the remote gate has to say the same.
    expect(
      statusOf(() =>
        admitCaller(
          { talent: 'appOpen' },
          locals({
            talent: talent({
              niveau: '4eme',
              welcomeSeenAt: null,
              onboardingSchoolYear: null,
            }),
          }),
        ),
      ),
    ).toBe(403);
  });

  it("refuses the app to a talent whose dossier is last year's", () => {
    expect(
      statusOf(() =>
        admitCaller(
          { talent: 'appOpen' },
          locals({ talent: talent({ onboardingSchoolYear: '2001-2002' }) }),
        ),
      ),
    ).toBe(403);
  });

  it('admits a talent still in the wizard where the gate says signedIn', () => {
    const inWizard = talent({ charterAcceptedAt: null, rulesSignedAt: null });
    expect(
      statusOf(() =>
        admitCaller({ talent: 'signedIn' }, locals({ talent: inWizard })),
      ),
    ).toBe('admitted');
  });

  it('refuses a talent gate to staff and to nobody', () => {
    expect(
      statusOf(() => admitCaller({ talent: 'signedIn' }, staff('admin'))),
    ).toBe(401);
    expect(
      statusOf(() => admitCaller({ talent: 'signedIn' }, locals({}))),
    ).toBe(401);
  });
});

describe('admitCaller: staff gates', () => {
  it('admits an admin to an admin gate and refuses a dev', () => {
    expect(statusOf(() => admitCaller({ admin: true }, staff('admin')))).toBe(
      'admitted',
    );
    expect(statusOf(() => admitCaller({ admin: true }, staff('dev')))).toBe(
      403,
    );
  });

  it('admits a role group by its members only', () => {
    expect(
      statusOf(() => admitCaller({ staff: 'devMember' }, staff('superdev'))),
    ).toBe('admitted');
    expect(
      statusOf(() => admitCaller({ staff: 'devMember' }, staff('admin'))),
    ).toBe(403);
  });

  it('refuses a staff gate to a talent, even one impersonated by an admin', () => {
    // An impersonation session carries the target's locals, so an admin acting
    // as a talent holds no staff profile and is a talent here.
    expect(
      statusOf(() =>
        admitCaller({ admin: true }, locals({ talent: talent() })),
      ),
    ).toBe(401);
  });
});
