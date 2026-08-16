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
import type { AdminApi_TokenTier } from '@prisma/client';
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

/**
 * Max mutating calls per token per rolling 24h, counted off the same rows.
 *
 * Much lower than the read quota because the failure modes are not comparable:
 * a looping reader wastes CPU, a looping writer rewrites configuration. Fifty is
 * far above any real day of admin work (the whole point is that these are
 * one-off repairs) and far below what a runaway agent would do before anyone
 * noticed.
 */
export const WRITE_CALL_QUOTA = 50;

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
  tier: AdminApi_TokenTier;
  writeEnabled: boolean;
  createdAt: Date;
  /** Shown once, then unrecoverable. Never persisted in this form. */
  secret: string;
};

/**
 * Mint a token for an admin. The caller is responsible for showing `secret`
 * exactly once and for never logging it.
 *
 * Capabilities are fixed here and never edited afterwards: re-scoping a
 * credential that is already sitting in somebody's config file is how a narrow
 * token quietly becomes a wide one. Widening means minting a new token and
 * revoking the old one, which is visible in the list and in the log.
 *
 * `writeEnabled` is refused outright on a leadership token rather than silently
 * ignored: tier 2 is read-only by construction, and a caller who asked for the
 * combination has misunderstood something worth failing loudly over.
 */
export async function mintToken(
  staffUserId: string,
  input: { label: string; tier?: AdminApi_TokenTier; writeEnabled?: boolean },
): Promise<MintedToken> {
  const tier = input.tier ?? 'core';
  const writeEnabled = input.writeEnabled ?? false;
  if (tier === 'leadership' && writeEnabled) {
    throw new Error('A leadership token cannot be granted write access.');
  }

  const secret = generateSecret();
  const row = await prisma.adminApi_Token.create({
    data: {
      staffUserId,
      label: input.label.trim(),
      tier,
      writeEnabled,
      tokenHash: hashSecret(secret),
    },
    select: {
      id: true,
      label: true,
      tier: true,
      writeEnabled: true,
      createdAt: true,
    },
  });
  return { ...row, secret };
}

/**
 * Revoke a token, from any admin's dialog.
 *
 * Scoped to a live token rather than to its owner (see {@link listTokens} for
 * why the inventory is shared), and stamping who did it: cutting somebody else's
 * credential is exactly the act that has to stay attributable. Revocation is a
 * timestamp rather than a delete, so the call log keeps pointing at a token that
 * still exists.
 */
export async function revokeToken(
  id: string,
  revokedByUserId: string,
): Promise<{ ok: boolean }> {
  const { count } = await prisma.adminApi_Token.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date(), revokedByUserId },
  });
  return { ok: count === 1 };
}

export type TokenSummary = {
  id: string;
  label: string;
  tier: AdminApi_TokenTier;
  writeEnabled: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  /** The admin who minted it, so a token nobody recognises still has a name on it. */
  owner: { id: string; name: string };
  /** Calls counted against the quota in the rolling 24h window (see `quotaWindowWhere`). */
  callsToday: number;
};

/**
 * Every token, newest first, revoked ones included (for the trail).
 *
 * Not scoped to the admin looking, on purpose. A leadership token is minted by
 * an admin FOR someone who has no Jump account, so its holder cannot cut it
 * either: a per-owner list left a token unrevocable by anyone the day its issuer
 * was unreachable, which is precisely the day it matters. Every admin already
 * reaches the same operations, and `revokedByUserId` records who cut what.
 *
 * Who owns a row is returned rather than decided here: the viewer is the
 * dialog's business, not this module's.
 */
export async function listTokens(): Promise<TokenSummary[]> {
  const rows = await prisma.adminApi_Token.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      label: true,
      tier: true,
      writeEnabled: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      staffUser: { select: { id: true, name: true, email: true } },
      _count: { select: { calls: { where: quotaWindowWhere() } } },
    },
  });
  return rows.map(({ _count, staffUser, ...token }) => ({
    ...token,
    owner: { id: staffUser.id, name: staffUser.name || staffUser.email },
    callsToday: _count.calls,
  }));
}

export type VerifiedToken = {
  tokenId: string;
  staffUserId: string;
  tier: AdminApi_TokenTier;
  writeEnabled: boolean;
};

/**
 * Resolve a bearer secret to its live token, stamping `lastUsedAt`.
 *
 * The lookup is by unique hash, which is also the comparison: unlike the
 * env-var secrets (`CRON_SECRET`, `WORKER_API_TOKEN`, compared with
 * `safeTokenEquals`), there is no known secret to compare against byte by byte
 * here, and an index probe on a sha256 digest leaks nothing about the plaintext.
 *
 * The owner's role is read here, not trusted from mint time. A departure was
 * already covered - `deleteStaffUser` deletes the `bauth_user` row and the FK
 * cascades the tokens away - but a demotion was not: `updateStaffRole` moves
 * `StaffProfile.staffRole` and `bauth_user.role` and has no business knowing
 * this table exists. So the credential asks, on every call, whether the human
 * behind it is still an admin. This holds for a leadership token too, whose
 * `staffUserId` is the admin who issued it.
 *
 * Returns null for a token that is unknown, revoked, or whose owner is no longer
 * an admin: the caller must not be able to tell "never existed" from "cut this
 * morning" from "issued by someone who changed jobs".
 */
export async function verifyToken(
  secret: string,
): Promise<VerifiedToken | null> {
  if (!secret.startsWith(SECRET_PREFIX)) return null;

  const row = await prisma.adminApi_Token.findUnique({
    where: { tokenHash: hashSecret(secret) },
    select: {
      id: true,
      staffUserId: true,
      tier: true,
      writeEnabled: true,
      revokedAt: true,
      staffUser: { select: { staffProfile: { select: { staffRole: true } } } },
    },
  });
  if (!row || row.revokedAt) return null;
  // Before `lastUsedAt`: a token that no longer resolves was not used, it was
  // presented.
  if (row.staffUser.staffProfile?.staffRole !== 'admin') return null;

  await prisma.adminApi_Token.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    tokenId: row.id,
    staffUserId: row.staffUserId,
    tier: row.tier,
    writeEnabled: row.writeEnabled,
  };
}

/** Calls charged to a token in the rolling quota window (see `quotaWindowWhere`). */
export async function countRecentCalls(tokenId: string): Promise<number> {
  return prisma.adminApi_Call.count({
    where: { tokenId, ...quotaWindowWhere() },
  });
}

/**
 * Mutating calls charged to a token in the same window. Separate ceiling, same
 * rows, no second counter to keep in sync and no `kind` column on the log.
 *
 * The write names are passed in rather than imported: this module is about
 * credentials, and the catalogue is the guard's business. Keeping the arrow
 * pointing that way also keeps the token dialog's import graph from dragging in
 * every aggregation service behind the catalogue.
 */
export async function countRecentWriteCalls(
  tokenId: string,
  writeOperationNames: string[],
): Promise<number> {
  return prisma.adminApi_Call.count({
    where: {
      tokenId,
      operation: { in: writeOperationNames },
      ...quotaWindowWhere(),
    },
  });
}
