import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runWithRequestContext,
  type RequestContext,
} from '#lib/server/requestContext.ts';

/**
 * Where a mail or an SMS goes, for both channels. This is the rule that keeps
 * a test environment from writing to a minor (RGPD): `OUTBOUND_MODE=real` is
 * the only way out of the trap, and everything else lands with a tester or is
 * dropped. The request context is the real one, entered per case.
 */

const env: Record<string, string | undefined> = {};
vi.mock('$app/env/private', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$app/env/private')>()),
  get OUTBOUND_MODE() {
    return env.OUTBOUND_MODE;
  },
  get EMAIL_DEV_RECIPIENTS() {
    return env.EMAIL_DEV_RECIPIENTS;
  },
  get SMS_DEV_RECIPIENTS() {
    return env.SMS_DEV_RECIPIENTS;
  },
}));

const { resolveMailRouting } = await import('./email/dev-redirect');
const { resolveSmsRouting } = await import('./sms/dev-redirect');

const nobody: RequestContext = {
  actorEmail: null,
  devRedirectEmails: [],
  devRedirectPhones: [],
  armedRealSends: false,
};

function within<T>(ctx: Partial<RequestContext>, fn: () => T): T {
  return runWithRequestContext({ ...nobody, ...ctx }, fn);
}

const channels = [
  ['mail', resolveMailRouting],
  ['SMS', resolveSmsRouting],
] as const;

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
});

describe.each(channels)('%s routing, shared head', (_channel, resolve) => {
  it('reaches the real recipient only when OUTBOUND_MODE is real', () => {
    env.OUTBOUND_MODE = 'real';
    expect(within({}, () => resolve(['tester@x.test']))).toEqual({
      kind: 'real',
    });
    for (const mode of [undefined, '', 'redirect', 'reel', ' Real ']) {
      env.OUTBOUND_MODE = mode;
      const trapped = mode?.trim().toLowerCase() !== 'real';
      expect(within({}, () => resolve()).kind === 'real').toBe(!trapped);
    }
  });

  it('lets a bypass or an armed session reach the real recipient', () => {
    expect(within({}, () => resolve('bypass'))).toEqual({ kind: 'real' });
    expect(within({ armedRealSends: true }, () => resolve())).toEqual({
      kind: 'real',
    });
  });

  it('sends an explicit list before any of the channel destinations', () => {
    expect(
      within(
        {
          devRedirectEmails: ['me@x.test'],
          devRedirectPhones: ['+33600000000'],
        },
        () => resolve(['creator'] as const),
      ),
    ).toEqual({ kind: 'redirect', to: ['creator'] });
  });

  it('drops a trapped send with nowhere to land', () => {
    expect(within({}, () => resolve()).kind).toBe('drop');
    expect(within({}, () => resolve([])).kind).toBe('drop');
  });
});

describe('mail destinations, in order', () => {
  it('tries the personal list, the actor, then EMAIL_DEV_RECIPIENTS', () => {
    env.EMAIL_DEV_RECIPIENTS = ' a@x.test , b@x.test ';
    expect(within({}, () => resolveMailRouting())).toEqual({
      kind: 'redirect',
      to: ['a@x.test', 'b@x.test'],
    });
    expect(
      within({ actorEmail: 'actor@x.test' }, () => resolveMailRouting()),
    ).toEqual({ kind: 'redirect', to: ['actor@x.test'] });
    expect(
      within(
        { actorEmail: 'actor@x.test', devRedirectEmails: ['me@x.test'] },
        () => resolveMailRouting(),
      ),
    ).toEqual({ kind: 'redirect', to: ['me@x.test'] });
  });
});

describe('SMS destinations, in order', () => {
  it('tries the personal list, then SMS_DEV_RECIPIENTS, never the actor', () => {
    expect(
      within({ actorEmail: 'actor@x.test' }, () => resolveSmsRouting()).kind,
    ).toBe('drop');
    env.SMS_DEV_RECIPIENTS = '+33611111111';
    expect(within({}, () => resolveSmsRouting())).toEqual({
      kind: 'redirect',
      to: ['+33611111111'],
    });
    expect(
      within({ devRedirectPhones: ['+33622222222'] }, () =>
        resolveSmsRouting(),
      ),
    ).toEqual({ kind: 'redirect', to: ['+33622222222'] });
  });
});
