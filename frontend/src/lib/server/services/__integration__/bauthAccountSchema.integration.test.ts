/**
 * `bauth_account` is BetterAuth's own table, generated from its `account`
 * model rather than authored here, so nothing in this codebase enforces that
 * `schema.prisma` still matches what the installed BetterAuth version expects
 * on that table. A dependency bump silently outran the schema once already: a
 * required `issuer` column landed in BetterAuth 1.7, and every Microsoft
 * sign-in on that version failed a Prisma validation error at query time.
 *
 * `microsoftOAuthCallback.integration.test.ts` is the round-trip regression
 * for that: it drives a real callback through BetterAuth and checks the row
 * it produces. This test stays alongside it, narrower and faster, as a direct
 * check on the `(issuer, accountId)` uniqueness constraint specifically - it
 * still catches a constraint regression even if the round-trip test's fake
 * provider setup ever changes shape.
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
