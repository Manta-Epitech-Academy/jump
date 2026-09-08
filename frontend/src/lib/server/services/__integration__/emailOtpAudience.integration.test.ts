/**
 * The email-OTP door, exercised over BetterAuth's own HTTP routes.
 *
 * Deliberately not through the `/login` page action: the action always
 * filtered by role, and the routes underneath it did not, so the gap between
 * the two is precisely what let a staff account sign in with a code for as
 * long as it did. A test that drove the action would have stayed green
 * throughout.
 *
 * Everything here posts to `${ORIGIN}/api/auth/...` against the production
 * `auth` singleton, so what is asserted is the app's real configuration:
 * the gate, `disableSignUp`, the model mappings and the trusted origin.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';

// The two OTP mail senders, so the template a recipient gets is observable.
// Nothing else in the chain is: with no `EmailActionMapping` row in the test
// database, `sendActionEmail` is a silent no-op by design.
vi.mock('$lib/server/otp', () => ({
  sendOtpEmail: vi.fn(async () => {}),
  sendParentOtpEmail: vi.fn(async () => {}),
}));

const { auth } = await import('$lib/server/auth');
const { sendOtpEmail, sendParentOtpEmail } = await import('$lib/server/otp');

const stamp = Date.now();
const staffEmail = `otp.staff.${stamp}@epitech.eu`;
const talentEmail = `otp.talent.${stamp}@e2e.invalid`;
const parentEmail = `otp.parent.${stamp}@e2e.invalid`;
const dualEmail = `otp.dual.${stamp}@epitech.eu`;

function postAuth(path: string, body: unknown): Promise<Response> {
  return auth.handler(
    new Request(`${env.ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The send route carries better-auth's form-CSRF middleware and the
        // router checks the origin on every POST; ORIGIN is what
        // `createAuthOptions` trusts.
        origin: env.ORIGIN!,
      },
      body: JSON.stringify(body),
    }),
  );
}

const signInIdentifier = (email: string) => `sign-in-otp-${email}`;

/**
 * An address with no `bauth_user` row at all. Every refusal below is asserted
 * against this rather than against a literal: the gate refuses by handing
 * BetterAuth an address it has never seen, so what a refused caller gets is
 * whatever the plugin gives an unknown one, and hard-coding those two
 * responses is what made the first version of the gate wrong.
 */
const unknownEmail = `otp.nobody.${stamp}@e2e.invalid`;

/** Status plus raw body, so parity is compared byte for byte. */
async function outcome(path: string, body: unknown) {
  const response = await postAuth(path, body);
  return {
    status: response.status,
    body: await response.text(),
    setCookie: response.headers.get('set-cookie'),
  };
}

const SEND = '/api/auth/email-otp/send-verification-otp';

function storedOtp(email: string): Promise<string | null> {
  return prisma.bauth_verification
    .findFirst({
      where: { identifier: signInIdentifier(email) },
      orderBy: { createdAt: 'desc' },
      select: { value: true },
    })
    .then((row) =>
      row ? row.value.slice(0, row.value.lastIndexOf(':')) : null,
    );
}

describe('email OTP audience (integration)', () => {
  const userIds: string[] = [];
  const talentIds: string[] = [];
  let staffUserId = '';

  beforeAll(async () => {
    assertTestDatabase();

    const staff = await createAdminAccount(staffEmail);
    staffUserId = staff.id;
    userIds.push(staff.id);

    const talentUser = await prisma.bauth_user.create({
      data: {
        email: talentEmail,
        role: 'student',
        emailVerified: true,
        name: 'Talent OTP',
      },
    });
    userIds.push(talentUser.id);
    const talent = await prisma.talent.create({
      data: { nom: 'OtpTalent', prenom: String(stamp), userId: talentUser.id },
    });
    talentIds.push(talent.id);

    const parentUser = await prisma.bauth_user.create({
      data: {
        email: parentEmail,
        role: 'parent',
        emailVerified: true,
        name: 'Parent OTP',
      },
    });
    userIds.push(parentUser.id);

    // Bad Salesforce data made flesh: one login carrying both a StaffProfile
    // and a Talent. `ensureTalentUser` refuses to create it, and the login
    // action tested `user.talent` before any role, so this shape was the one
    // that walked through the page filter too.
    const dualUser = await prisma.bauth_user.create({
      data: {
        email: dualEmail,
        role: 'student',
        emailVerified: true,
        staffProfile: { create: { staffRole: 'dev' } },
      },
    });
    userIds.push(dualUser.id);
    const dualTalent = await prisma.talent.create({
      data: { nom: 'OtpDual', prenom: String(stamp), userId: dualUser.id },
    });
    talentIds.push(dualTalent.id);
  });

  beforeEach(() => {
    vi.mocked(sendOtpEmail).mockClear();
    vi.mocked(sendParentOtpEmail).mockClear();
  });

  afterAll(async () => {
    try {
      await prisma.bauth_verification.deleteMany({
        where: {
          identifier: {
            in: [staffEmail, talentEmail, parentEmail, dualEmail].map(
              signInIdentifier,
            ),
          },
        },
      });
      await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
      await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('mints no code for a staff address, and says nothing about the account', async () => {
    const response = await postAuth(
      '/api/auth/email-otp/send-verification-otp',
      {
        email: staffEmail,
        type: 'sign-in',
      },
    );

    // Byte for byte what an address with no account gets, so the answer
    // discloses nothing either way.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    expect(
      await prisma.bauth_verification.count({
        where: { identifier: signInIdentifier(staffEmail) },
      }),
    ).toBe(0);
    expect(sendOtpEmail).not.toHaveBeenCalled();
    expect(sendParentOtpEmail).not.toHaveBeenCalled();
  });

  it('refuses a staff sign-in even when a code is already stored', async () => {
    // The exact row the send route would have written, so this covers the
    // window where a code was minted before the gate existed - or by any
    // future path that manages to store one.
    await prisma.bauth_verification.create({
      data: {
        identifier: signInIdentifier(staffEmail),
        value: '123456:0',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const response = await postAuth('/api/auth/sign-in/email-otp', {
      email: staffEmail,
      otp: '123456',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(
      await prisma.bauth_session.count({ where: { userId: staffUserId } }),
    ).toBe(0);
    // The handler never ran, so the code was not consumed either: proof the
    // refusal happened before the endpoint rather than inside it.
    expect(
      await prisma.bauth_verification.count({
        where: { identifier: signInIdentifier(staffEmail) },
      }),
    ).toBe(1);
  });

  it('answers a refused address exactly as it answers an unknown one', async () => {
    const [staff, unknown] = await Promise.all([
      outcome(SEND, { email: staffEmail, type: 'sign-in' }),
      outcome(SEND, { email: unknownEmail, type: 'sign-in' }),
    ]);

    expect(staff).toEqual(unknown);
    expect(staff.status).toBe(200);

    // On the consuming side the same way. The code is planted against the
    // staff address and CORRECT, so this is the one comparison that would
    // still hold if the code were simply wrong: a right code has to buy a
    // staff caller exactly what a wrong one buys an address nobody has.
    await prisma.bauth_verification.create({
      data: {
        identifier: signInIdentifier(staffEmail),
        value: '654321:0',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const [staffSignIn, unknownSignIn] = await Promise.all([
      outcome('/api/auth/sign-in/email-otp', {
        email: staffEmail,
        otp: '654321',
      }),
      outcome('/api/auth/sign-in/email-otp', {
        email: unknownEmail,
        otp: '654321',
      }),
    ]);

    expect(staffSignIn).toEqual(unknownSignIn);
    expect(staffSignIn.status).toBe(400);
    expect(staffSignIn.setCookie).toBeNull();
    expect(
      await prisma.bauth_session.count({ where: { userId: staffUserId } }),
    ).toBe(0);

    // Left behind, it would break the next test's row count, which is a
    // deliberate 1.
    await prisma.bauth_verification.deleteMany({
      where: { identifier: signInIdentifier(staffEmail) },
    });
  });

  it('leaves the endpoint to answer for a body it would reject anyway', async () => {
    // A `before` hook runs ahead of body validation, so a gate that answered
    // `200 {success:true}` itself would answer these too - and the endpoint
    // rejects them for an eligible address, which turns the difference into an
    // account-existence probe. Every address must get the same thing here.
    const rejected = [
      { label: 'no type', partial: {} },
      // The plugin refuses this type on this route and says to use
      // /email-otp/request-email-change, before it looks any address up.
      { label: 'change-email type', partial: { type: 'change-email' } },
    ];

    for (const { label, partial } of rejected) {
      const [staff, talent, unknown] = await Promise.all([
        outcome(SEND, { email: staffEmail, ...partial }),
        outcome(SEND, { email: talentEmail, ...partial }),
        outcome(SEND, { email: unknownEmail, ...partial }),
      ]);

      expect(staff, label).toEqual(talent);
      expect(unknown, label).toEqual(talent);
      expect(talent.status, label).toBe(400);
    }

    // Same rule for a malformed address: the endpoint's own INVALID_EMAIL, not
    // a silent success of ours.
    const malformed = await outcome(SEND, {
      email: 'not-an-email',
      type: 'sign-in',
    });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toContain('INVALID_EMAIL');
  });

  it('stores nothing that outlives a refused call', async () => {
    await postAuth(SEND, { email: staffEmail, type: 'sign-in' });

    // The substitute address the gate hands BetterAuth takes the plugin's
    // unknown-address path, which writes a row and deletes it again before it
    // answers. Nothing may be left behind under either address.
    expect(
      await prisma.bauth_verification.count({
        where: { identifier: { contains: 'otp-door-refused' } },
      }),
    ).toBe(0);
    expect(
      await prisma.bauth_user.count({
        where: { email: { contains: 'otp-door-refused' } },
      }),
    ).toBe(0);
  });

  it('refuses an address that is both staff and a talent', async () => {
    const response = await postAuth(
      '/api/auth/email-otp/send-verification-otp',
      {
        email: dualEmail,
        type: 'sign-in',
      },
    );

    expect(response.status).toBe(200);
    expect(
      await prisma.bauth_verification.count({
        where: { identifier: signInIdentifier(dualEmail) },
      }),
    ).toBe(0);
  });

  it('signs a talent in through the code they were mailed', async () => {
    const send = await postAuth('/api/auth/email-otp/send-verification-otp', {
      email: talentEmail,
      type: 'sign-in',
    });
    expect(send.status).toBe(200);
    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
    expect(sendParentOtpEmail).not.toHaveBeenCalled();

    const otp = await storedOtp(talentEmail);
    expect(otp).toMatch(/^\d{6}$/);
    // What was stored is what was mailed: `resendStrategy: 'reuse'` rests on
    // the two being the same string.
    expect(vi.mocked(sendOtpEmail).mock.calls[0][1]).toBe(otp);

    const signIn = await postAuth('/api/auth/sign-in/email-otp', {
      email: talentEmail,
      otp,
    });

    expect(signIn.status).toBe(200);
    expect(signIn.headers.get('set-cookie')).toContain(
      'better-auth.session_token',
    );
    const user = await prisma.bauth_user.findUnique({
      where: { email: talentEmail },
      select: { id: true },
    });
    expect(
      await prisma.bauth_session.count({ where: { userId: user!.id } }),
    ).toBe(1);
  });

  it('signs a legal guardian in, on their own mail template', async () => {
    const send = await postAuth('/api/auth/email-otp/send-verification-otp', {
      email: parentEmail,
      type: 'sign-in',
    });
    expect(send.status).toBe(200);
    expect(sendParentOtpEmail).toHaveBeenCalledTimes(1);
    expect(sendOtpEmail).not.toHaveBeenCalled();

    const otp = await storedOtp(parentEmail);
    expect(otp).toMatch(/^\d{6}$/);

    const signIn = await postAuth('/api/auth/sign-in/email-otp', {
      email: parentEmail,
      otp,
    });

    expect(signIn.status).toBe(200);
    expect(signIn.headers.get('set-cookie')).toContain(
      'better-auth.session_token',
    );
    const user = await prisma.bauth_user.findUnique({
      where: { email: parentEmail },
      select: { id: true },
    });
    expect(
      await prisma.bauth_session.count({ where: { userId: user!.id } }),
    ).toBe(1);
  });
});
