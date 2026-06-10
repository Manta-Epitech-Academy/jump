import { Prisma } from '@prisma/client';

/**
 * Mutation core for auth-identity repairs. Deliberately depends on NOTHING but
 * `@prisma/client` (no `$lib/server/db` singleton, no SvelteKit), so the core
 * stays decoupled from the request layer and reusable. Its driver is the admin
 * UI service (`authIdentityRepairService.ts`), which wraps these in the request's
 * prisma singleton + admin actor (and which the Salesforce sync calls through
 * `autoResolveAuthIdentity` to self-heal the safe verdicts).
 *
 * Every operation is split into `plan*` (read-only: re-derive the situation and
 * assert the precondition, throwing a human reason on failure) and `apply*`
 * (re-plans, then mutates, then records the ledger). Both take a
 * `Prisma.TransactionClient`, so the caller controls the transaction and a
 * full `PrismaClient` can be passed for a read-only dry-run plan.
 *
 * The precondition re-check lives HERE, at write time, inside the caller's
 * transaction — not in the read-only classifier (`authIdentityService.ts`),
 * which is advisory/display only. So a concurrent sync or re-login between
 * diagnosis and apply can never make an operation act on stale state: if the
 * world moved, `plan*` throws and the transaction rolls back untouched.
 */

export type AuthRepairKind = 'repoint_drop' | 'rename' | 'swap' | 'sever';

const norm = (e: string | null | undefined): string | null =>
  e?.toLowerCase().trim() || null;

/** A bauth_user found to hold an email, with the relations that decide what it
 * is (orphan vs talent vs staff). */
const HOLDER_SELECT = {
  id: true,
  email: true,
  role: true,
  staffProfile: { select: { id: true } },
  talent: { select: { id: true, email: true } },
} satisfies Prisma.bauth_userSelect;

/** Is `email` a parent contact on any talent? (parent accounts must never be
 * adopted as a student login.) */
async function isParentEmail(
  db: Prisma.TransactionClient,
  email: string,
): Promise<boolean> {
  const hit = await db.talent.findFirst({
    where: {
      OR: [
        { parentEmail: { equals: email, mode: 'insensitive' } },
        { parent2Email: { equals: email, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return hit !== null;
}

/** Does `email` belong to a real identity OTHER than `exceptTalentId`? Used to
 * detect the backward exposure: a stale email that a real person can log in
 * with, who would then land on this talent. */
async function emailBelongsToOther(
  db: Prisma.TransactionClient,
  email: string,
  exceptTalentId: string,
): Promise<boolean> {
  const otherTalent = await db.talent.findFirst({
    where: {
      id: { not: exceptTalentId },
      email: { equals: email, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (otherTalent) return true;
  if (await isParentEmail(db, email)) return true;
  const staff = await db.bauth_user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      staffProfile: { isNot: null },
    },
    select: { id: true },
  });
  return staff !== null;
}

async function loadDriftedTalent(
  db: Prisma.TransactionClient,
  talentId: string,
) {
  const talent = await db.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!talent) throw new Error(`No talent with id ${talentId}.`);
  if (!talent.user)
    throw new Error(
      'Talent has no linked account (userId null) — nothing to repair.',
    );
  if (!talent.email) throw new Error('Talent has no email.');
  const targetEmail = norm(talent.email)!;
  const staleEmail = norm(talent.user.email)!;
  if (targetEmail === staleEmail)
    throw new Error('Link is already aligned (no conflict).');
  return {
    name: `${talent.prenom} ${talent.nom}`,
    linkedUserId: talent.user.id,
    targetEmail,
    staleEmail,
  };
}

// ── repoint + drop (ORPHAN_HOLDER) ────────────────────────────────────────

export interface RepointPlan {
  talentId: string;
  talentName: string;
  staleUserId: string;
  staleEmail: string;
  orphanUserId: string;
  targetEmail: string;
}

export async function planRepointAndDrop(
  db: Prisma.TransactionClient,
  talentId: string,
): Promise<RepointPlan> {
  const t = await loadDriftedTalent(db, talentId);

  const holder = await db.bauth_user.findFirst({
    where: { email: { equals: t.targetEmail, mode: 'insensitive' } },
    select: HOLDER_SELECT,
  });
  if (!holder)
    throw new Error(
      `Verdict is SIMPLE_DRIFT (nobody holds ${t.targetEmail}); use rename, not repoint+drop.`,
    );
  if (holder.staffProfile)
    throw new Error(
      'Holder is a STAFF account (STAFF_HOLDER) — escalate, do not force.',
    );
  if (holder.talent)
    throw new Error(
      `Holder is linked to another talent (id=${holder.talent.id}) — inversion, not orphan.`,
    );
  if (holder.role === 'parent' || (await isParentEmail(db, t.targetEmail)))
    throw new Error(
      'Holder is a PARENT account (PARENT_HOLDER) — escalate, do not force.',
    );

  // Backward: dropping the stale account is only safe if no real other identity
  // owns its email. Otherwise this is an exposure → use sever/escalate.
  if (await emailBelongsToOther(db, t.staleEmail, talentId))
    throw new Error(
      'Stale email belongs to a real other identity (EXPOSURE) — use sever, not repoint+drop.',
    );

  return {
    talentId,
    talentName: t.name,
    staleUserId: t.linkedUserId,
    staleEmail: t.staleEmail,
    orphanUserId: holder.id,
    targetEmail: t.targetEmail,
  };
}

export async function applyRepointAndDrop(
  db: Prisma.TransactionClient,
  talentId: string,
  resolvedBy: string,
): Promise<RepointPlan> {
  const plan = await planRepointAndDrop(db, talentId);

  // 1. Repoint the talent onto the orphan (frees the stale account's link).
  await db.talent.update({
    where: { id: talentId },
    data: { userId: plan.orphanUserId },
  });
  // 2. Promote the orphan to a proper student identity.
  await db.bauth_user.update({
    where: { id: plan.orphanUserId },
    data: { role: 'student', name: plan.talentName },
  });
  // 3. Hard-delete the dereferenced stale account. Sessions/accounts cascade
  //    but are cleared explicitly first (same shape as
  //    talentAccount.ts:resetTalentToImport). A stray staff-authored FK raises
  //    P2003 and rolls the whole transaction back, untouched.
  await db.bauth_session.deleteMany({ where: { userId: plan.staleUserId } });
  await db.bauth_account.deleteMany({ where: { userId: plan.staleUserId } });
  await db.bauth_user.delete({ where: { id: plan.staleUserId } });

  await db.authIdentityRepair.create({
    data: {
      talentId,
      kind: 'repoint_drop' satisfies AuthRepairKind,
      toUserId: plan.orphanUserId,
      fromUserId: plan.staleUserId,
      fromEmail: plan.staleEmail,
      toEmail: plan.targetEmail,
      resolvedBy,
    },
  });
  return plan;
}

// ── rename (SIMPLE_DRIFT) ──────────────────────────────────────────────────

export interface RenamePlan {
  talentId: string;
  talentName: string;
  linkedUserId: string;
  staleEmail: string;
  targetEmail: string;
}

export async function planRename(
  db: Prisma.TransactionClient,
  talentId: string,
): Promise<RenamePlan> {
  const t = await loadDriftedTalent(db, talentId);
  const holder = await db.bauth_user.findFirst({
    where: { email: { equals: t.targetEmail, mode: 'insensitive' } },
    select: { id: true },
  });
  if (holder)
    throw new Error(
      'Target email is already held by another account — not SIMPLE_DRIFT; use repoint+drop or swap.',
    );
  // Even with no account on it, a parent-contact email must not be renamed onto:
  // it is bad SF data (a minor with a parent's address in the student record),
  // a PARENT_HOLDER to escalate, never a drift to auto-fix. (A staff email
  // always has an account, so the holder check above already covers staff.)
  if (await isParentEmail(db, t.targetEmail))
    throw new Error(
      'Target email is a parent contact (PARENT_HOLDER) — escalate, do not force.',
    );
  return {
    talentId,
    talentName: t.name,
    linkedUserId: t.linkedUserId,
    staleEmail: t.staleEmail,
    targetEmail: t.targetEmail,
  };
}

export async function applyRename(
  db: Prisma.TransactionClient,
  talentId: string,
  resolvedBy: string,
): Promise<RenamePlan> {
  const plan = await planRename(db, talentId);
  // May still race a concurrent account creation → P2002; the caller's tx rolls
  // back and the row reverts to a collision case on the next classification.
  await db.bauth_user.update({
    where: { id: plan.linkedUserId },
    data: { email: plan.targetEmail },
  });
  await db.authIdentityRepair.create({
    data: {
      talentId,
      kind: 'rename' satisfies AuthRepairKind,
      toUserId: plan.linkedUserId,
      fromUserId: plan.linkedUserId,
      fromEmail: plan.staleEmail,
      toEmail: plan.targetEmail,
      resolvedBy,
    },
  });
  return plan;
}

// ── swap (SYMMETRIC_INVERSION) ─────────────────────────────────────────────

export interface SwapPlan {
  aTalentId: string;
  aUserId: string;
  aStaleEmail: string;
  aTargetEmail: string;
  bTalentId: string;
  bUserId: string;
  bStaleEmail: string;
  bTargetEmail: string;
}

export async function planSwap(
  db: Prisma.TransactionClient,
  talentId: string,
): Promise<SwapPlan> {
  const a = await loadDriftedTalent(db, talentId);
  const holder = await db.bauth_user.findFirst({
    where: { email: { equals: a.targetEmail, mode: 'insensitive' } },
    select: HOLDER_SELECT,
  });
  if (!holder || !holder.talent)
    throw new Error(
      'Target email is not held by another talent — not an inversion.',
    );
  const bTalentId = holder.talent.id;
  const bTargetEmail = norm(holder.talent.email);
  const bStaleEmail = norm(holder.email);
  // Symmetric ⇔ B's own target email is exactly A's stale email, i.e. each side
  // holds the other's email. Anything else is a degraded inversion (no safe
  // automatic move).
  if (bTargetEmail !== a.staleEmail)
    throw new Error(
      'Inversion is not symmetric (DEGRADED_INVERSION) — handle manually.',
    );

  return {
    aTalentId: talentId,
    aUserId: a.linkedUserId,
    aStaleEmail: a.staleEmail,
    aTargetEmail: a.targetEmail,
    bTalentId,
    bUserId: holder.id,
    bStaleEmail: bStaleEmail!,
    bTargetEmail: bTargetEmail!,
  };
}

export async function applySwap(
  db: Prisma.TransactionClient,
  talentId: string,
  resolvedBy: string,
): Promise<SwapPlan> {
  const plan = await planSwap(db, talentId);
  // Exchange the two accounts' emails under the unique constraint via a temp
  // value. After: A's account holds A's target, B's account holds B's target,
  // and neither Talent.userId moved — so both links are aligned at once.
  const tmp = `__swap_tmp_${plan.aUserId}@invalid.local`;
  await db.bauth_user.update({
    where: { id: plan.aUserId },
    data: { email: tmp },
  });
  await db.bauth_user.update({
    where: { id: plan.bUserId },
    data: { email: plan.aStaleEmail },
  });
  await db.bauth_user.update({
    where: { id: plan.aUserId },
    data: { email: plan.bStaleEmail },
  });

  await db.authIdentityRepair.createMany({
    data: [
      {
        talentId: plan.aTalentId,
        kind: 'swap' satisfies AuthRepairKind,
        toUserId: plan.aUserId,
        fromUserId: plan.aUserId,
        fromEmail: plan.aStaleEmail,
        toEmail: plan.aTargetEmail,
        resolvedBy,
      },
      {
        talentId: plan.bTalentId,
        kind: 'swap' satisfies AuthRepairKind,
        toUserId: plan.bUserId,
        fromUserId: plan.bUserId,
        fromEmail: plan.bStaleEmail,
        toEmail: plan.bTargetEmail,
        resolvedBy,
      },
    ],
  });
  return plan;
}

// ── sever (emergency exposure stop) ────────────────────────────────────────

export interface SeverPlan {
  talentId: string;
  talentName: string;
  fromUserId: string;
  fromEmail: string;
}

export async function planSever(
  db: Prisma.TransactionClient,
  talentId: string,
): Promise<SeverPlan> {
  const t = await loadDriftedTalent(db, talentId);
  return {
    talentId,
    talentName: t.name,
    fromUserId: t.linkedUserId,
    fromEmail: t.staleEmail,
  };
}

export async function applySever(
  db: Prisma.TransactionClient,
  talentId: string,
  resolvedBy: string,
): Promise<SeverPlan> {
  const plan = await planSever(db, talentId);
  // Detach only: null the link so whoever owns the stale email stops landing on
  // this talent. The account itself is left intact (it may be a real person's).
  // The talent re-links correctly on next login via `ensureTalentUser`.
  await db.talent.update({ where: { id: talentId }, data: { userId: null } });
  await db.authIdentityRepair.create({
    data: {
      talentId,
      kind: 'sever' satisfies AuthRepairKind,
      toUserId: null,
      fromUserId: plan.fromUserId,
      fromEmail: plan.fromEmail,
      toEmail: null,
      resolvedBy,
    },
  });
  return plan;
}
