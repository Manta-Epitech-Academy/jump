/**
 * `bauth_account` is BetterAuth's own table, generated from its `account`
 * model rather than authored here, so nothing in this codebase enforces that
 * `schema.prisma` still matches what the installed BetterAuth version expects
 * on that table. A dependency bump silently outran the schema once already: a
 * required `issuer` column landed in BetterAuth 1.7, and every Microsoft
 * sign-in on that version fails a Prisma validation error at query time,
 * caught by nothing short of an actual OAuth round-trip, which nothing in the
 * suite attempts (staff E2E specs mint a `bauth_session` row directly).
 *
 * This test is the next-best signal: it writes and reads a `bauth_account`
 * row the same shape the Prisma adapter does on an OAuth callback, keyed on
 * (issuer, accountId), which is the pair a bump changing that shape again
 * would break.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';

const stamp = Date.now();

describe('bauth_account schema (integration)', () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('accepts an OAuth account keyed on (issuer, accountId), the shape the prisma-adapter writes', async () => {
    assertTestDatabase();

    const user = await prisma.bauth_user.create({
      data: {
        email: `bauth-account-schema-${stamp}@e2e.invalid`,
        name: 'Bauth Account Schema',
      },
    });
    userIds.push(user.id);

    const issuer = 'https://login.microsoftonline.com/test-tenant/v2.0';
    const accountId = `oid-${stamp}`;

    const account = await prisma.bauth_account.create({
      data: { userId: user.id, issuer, accountId, providerId: 'microsoft' },
    });
    expect(account.issuer).toBe(issuer);

    const found = await prisma.bauth_account.findFirst({
      where: { issuer, accountId },
    });
    expect(found?.id).toBe(account.id);
  });

  it('enforces uniqueness on (issuer, accountId)', async () => {
    assertTestDatabase();

    const user = await prisma.bauth_user.create({
      data: {
        email: `bauth-account-unique-${stamp}@e2e.invalid`,
        name: 'Bauth Account Unique',
      },
    });
    userIds.push(user.id);

    const issuer = 'https://login.microsoftonline.com/test-tenant/v2.0';
    const accountId = `oid-unique-${stamp}`;

    await prisma.bauth_account.create({
      data: { userId: user.id, issuer, accountId, providerId: 'microsoft' },
    });

    await expect(
      prisma.bauth_account.create({
        data: { userId: user.id, issuer, accountId, providerId: 'microsoft' },
      }),
    ).rejects.toThrow();
  });
});
