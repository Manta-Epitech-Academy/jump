/**
 * The per-email OTP ledger holds its cap under concurrency.
 *
 * It used to read the count, do the work, then record: ten parallel requests
 * for one address all read a count under 3 and all went through (security
 * audit run-1, #436). `claimAttempt` writes first and counts second, so a
 * burst may be refused whole but is never admitted over the cap.
 *
 * What each test pins:
 *  - a parallel burst admits at most the cap, and the refused claims leave no
 *    row behind, while a double submit goes through whole;
 *  - a full window refuses with a wait, and a released claim frees its slot;
 *  - one exhausted address leaves every other address alone, which is the
 *    whole point of keying on the email and not on a campus NAT's IP;
 *  - the sweep drops a row once its own bucket's window is over, not the
 *    longest one's.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import {
  claimAttempt,
  sweepExpiredAttempts,
} from '$lib/server/auth/rateLimiter';
import { assertTestDatabase } from './testDatabase';

describe('OTP rate limiter (integration)', () => {
  const stamp = Date.now();
  const address = (label: string) => `otp.limit.${label}.${stamp}@e2e.invalid`;
  const countRows = (email: string) =>
    prisma.otpAttempt.count({ where: { bucket: 'request', email } });

  beforeAll(() => {
    assertTestDatabase();
  });

  afterAll(async () => {
    await prisma.otpAttempt.deleteMany({
      where: {
        email: { startsWith: 'otp.limit.', endsWith: `.${stamp}@e2e.invalid` },
      },
    });
  });

  it('admits no more than the cap from a parallel burst', async () => {
    const email = address('burst');

    const claims = await Promise.all(
      Array.from({ length: 10 }, () => claimAttempt('request', email)),
    );
    const admitted = claims.filter((claim) => claim.allowed).length;

    // Often zero: a burst over the cap can be refused whole, since each claim
    // may count the others' rows before they are taken back. Only abuse sends
    // more than the cap at once; what matters is that none gets past it.
    expect(admitted).toBeLessThanOrEqual(3);
    // Every refused claim took its row back.
    expect(await countRows(email)).toBe(admitted);
  });

  it('admits a double submit whole', async () => {
    const email = address('double');

    const claims = await Promise.all([
      claimAttempt('request', email),
      claimAttempt('request', email),
    ]);

    expect(claims.every((claim) => claim.allowed)).toBe(true);
  });

  it('refuses a full window with a wait, and a release frees a slot', async () => {
    const email = address('window');

    const first = await claimAttempt('request', email);
    await claimAttempt('request', email);
    await claimAttempt('request', email);

    const refused = await claimAttempt('request', email);
    expect(refused.allowed).toBe(false);
    if (refused.allowed) return;
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(600);
    expect(await countRows(email)).toBe(3);

    expect(first.allowed).toBe(true);
    if (!first.allowed) return;
    await first.release();

    expect((await claimAttempt('request', email)).allowed).toBe(true);
  });

  it('leaves the other addresses alone when one is exhausted', async () => {
    const exhausted = address('exhausted');
    for (let i = 0; i < 4; i++) await claimAttempt('request', exhausted);
    expect((await claimAttempt('request', exhausted)).allowed).toBe(false);

    // A cohort signing in together from one network: one claim each.
    const cohort = Array.from({ length: 30 }, (_, i) => address(`cohort${i}`));
    const claims = await Promise.all(
      cohort.map((email) => claimAttempt('request', email)),
    );
    expect(claims.every((claim) => claim.allowed)).toBe(true);
  });

  // A row names an address, often a minor's: a code's row is kept the ten
  // minutes its limit reads, not the day `parent_welcome` needs.
  it('sweeps each bucket on its own window', async () => {
    const email = address('sweep');
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.otpAttempt.createMany({
      data: (['request', 'verify', 'parent_welcome'] as const).map(
        (bucket) => ({ bucket, email, createdAt: anHourAgo }),
      ),
    });

    await sweepExpiredAttempts();

    const left = await prisma.otpAttempt.findMany({
      where: { email },
      select: { bucket: true },
    });
    expect(left).toEqual([{ bucket: 'parent_welcome' }]);
  });
});
