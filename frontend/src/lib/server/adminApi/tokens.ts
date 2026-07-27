/**
 * Nominative bearer tokens for the curated admin API.
 *
 * Shape of the secret: `jump_` + 32 random bytes, base64url. Only its sha256 is
 * stored, so a `pg_dump` (or a screenshot of the tokens table) carries nothing
 * usable, and the plaintext exists exactly once, in the response to the mint
 * that created it.
 *
 * Hashing goes through `node:crypto`, not `Bun.CryptoHasher`. Bun implements it
 * natively so there is nothing to gain from the Bun-specific API for a digest,
 * and the portable one also runs under the Vitest harness (vite-node, not the Bun
 * runtime), where `Bun` is simply not defined. `Bun.Image` in the image pipeline
 * is the opposite case: no standard-library equivalent, so the Bun API earns its
 * keep there.
 */

import { createHash } from 'node:crypto';
import { prisma } from '$lib/server/db';

const SECRET_BYTES = 32;
const SECRET_PREFIX = 'jump_';

/**
 * Max calls per token per rolling 24h. A cap the seminar asked for ("caps durs
 * ... quota par token"): a client stuck in a loop burns its own quota and
 * surfaces as 429s in the audit log, instead of hammering the pods. Counted off
 * `AdminApi_Call`, so there is no counter to keep in sync.
 */
export const DAILY_CALL_QUOTA = 500;

const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The rows that count against the quota: everything the token was served or
 * charged for, EXCEPT the 429s the quota itself produced.
 *
 * Excluding them is not leniency, it is what makes the cap recover. A refusal
 * writes an audit row like any other call, so counting 429s fed the count that
 * caused them: a client that hit the cap and then retried faster than once every
 * ~3 minutes kept the window above 500 forever, and stayed locked out long after
 * its original burst had aged out. A misbehaving client still burns quota through
 * its 200s, 400s and 500s.
 *
 * Shared by the quota check and the dialog's "appels sur 24 h" hint so the figure
 * an admin reads is the figure that locks them out.
 */
function quotaWindowWhere() {
  return {
    createdAt: { gte: new Date(Date.now() - QUOTA_WINDOW_MS) },
    status: { not: 429 },
  };
}

/** sha256 hex of a secret. The stored form; never reversed, only recomputed. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
  return SECRET_PREFIX + Buffer.from(bytes).toString('base64url');
}

export type MintedToken = {
  id: string;
  label: string;
  createdAt: Date;
  /** Shown once, then unrecoverable. Never persisted in this form. */
  secret: string;
};

/**
 * Mint a token for an admin. The caller is responsible for showing `secret`
 * exactly once and for never logging it.
 */
export async function mintToken(
  staffUserId: string,
  label: string,
): Promise<MintedToken> {
  const secret = generateSecret();
  const row = await prisma.adminApi_Token.create({
    data: { staffUserId, label: label.trim(), tokenHash: hashSecret(secret) },
    select: { id: true, label: true, createdAt: true },
  });
  return { ...row, secret };
}

/**
 * Revoke a token. Scoped to its owner: the dialog manages "my tokens", so an id
 * from elsewhere is not a valid target. Revocation stamps a timestamp instead of
 * deleting, so the call log keeps pointing at a token that still exists.
 */
export async function revokeToken(
  id: string,
  staffUserId: string,
): Promise<{ ok: boolean }> {
  const { count } = await prisma.adminApi_Token.updateMany({
    where: { id, staffUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { ok: count === 1 };
}

export type TokenSummary = {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  /** Calls counted against the quota in the rolling 24h window (see `quotaWindowWhere`). */
  callsToday: number;
};

/** An admin's own tokens, newest first, revoked ones included (for the trail). */
export async function listTokens(staffUserId: string): Promise<TokenSummary[]> {
  const rows = await prisma.adminApi_Token.findMany({
    where: { staffUserId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      label: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      _count: { select: { calls: { where: quotaWindowWhere() } } },
    },
  });
  return rows.map(({ _count, ...token }) => ({
    ...token,
    callsToday: _count.calls,
  }));
}

export type VerifiedToken = { tokenId: string; staffUserId: string };

/**
 * Resolve a bearer secret to its live token, stamping `lastUsedAt`.
 *
 * The lookup is by unique hash, which is also the comparison: unlike the
 * env-var secrets (`CRON_SECRET`, `WORKER_API_TOKEN`, compared with
 * `safeTokenEquals`), there is no known secret to compare against byte by byte
 * here, and an index probe on a sha256 digest leaks nothing about the plaintext.
 *
 * Returns null for unknown and for revoked tokens alike: the caller must not be
 * able to tell "never existed" from "cut this morning".
 */
export async function verifyToken(
  secret: string,
): Promise<VerifiedToken | null> {
  if (!secret.startsWith(SECRET_PREFIX)) return null;

  const row = await prisma.adminApi_Token.findUnique({
    where: { tokenHash: hashSecret(secret) },
    select: { id: true, staffUserId: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;

  await prisma.adminApi_Token.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return { tokenId: row.id, staffUserId: row.staffUserId };
}

/** Calls charged to a token in the rolling quota window (see `quotaWindowWhere`). */
export async function countRecentCalls(tokenId: string): Promise<number> {
  return prisma.adminApi_Call.count({
    where: { tokenId, ...quotaWindowWhere() },
  });
}
