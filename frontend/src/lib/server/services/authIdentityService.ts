import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import type {
  AuthConflict,
  AuthConflictVerdict,
  AuthAccountSummary,
  ExposureKind,
  AccountNature,
} from '$lib/domain/authIdentity';

/**
 * Auth-identity conflicts: the login-layer sibling of `reconciliationService`.
 *
 * `reconciliationService` diffs the *data* layer (`Talent` vs the
 * `TalentSfImport` mirror). This service diffs the *identity* layer: the
 * `bauth_user` a talent is linked to (`Talent.userId`) versus the email SF says
 * that talent should log in with (`TalentSfImport.sfEmail`).
 *
 * The single invariant that makes login work:
 *
 *   the `bauth_user` pointed to by `Talent.userId` must carry the same email as
 *   `TalentSfImport.sfEmail` (normalized).
 *
 * Why: a student types `Talent.email`, BetterAuth opens a session on whatever
 * `bauth_user` holds that email, and the talent dashboard only renders if THAT
 * `bauth_user` is the one the Talent points to (`hooks.server.ts` loads
 * `locals.talent` from `bauth_user.talent`, i.e. by the *session* account, not
 * by email). When the two emails diverge the student logs in "into the void".
 *
 * How divergence happens: Salesforce changes a talent's email; the sync updates
 * `Talent.email` but its paired `bauth_user.email` update collides (P2002) with
 * an account that already holds the new email (one the student created by
 * logging in with it directly via OTP). `ensureTalentUser` then early-returns
 * forever on the now-stale link and never reconciles. An email *inversion* on
 * the Salesforce side (two records swapped) is the recurring root cause.
 *
 * This module only CLASSIFIES (read-only). It mirrors the convention from
 * `reconciliationService`: conflicts are computed on demand, never stored. The
 * resolution operations (repoint, swap, sever) and their audit ledger are a
 * separate, deliberately-gated concern and live elsewhere.
 */

const norm = (email: string | null | undefined): string | null =>
  email?.toLowerCase().trim() || null;

// Verdict semantics (types live in `$lib/domain/authIdentity`):
//  - ORPHAN_HOLDER       held by an account with no talent/staff/parent link.
//                        Repoint the Talent onto it (the live sessions are
//                        there) and drop the stale account (repoint+drop).
//  - SYMMETRIC_INVERSION held by another Talent, cross is symmetric (their
//                        emails are each other's). A temp-value swap fixes both.
//  - DEGRADED_INVERSION  held by another Talent, NOT symmetric. No automatic
//                        move is provably correct; two-sided manual care.
//  - PARENT_HOLDER       held by a parent login. Escalate, never force.
//  - STAFF_HOLDER        held by a staff account. Escalate, never force.

// The bauth_user shape we summarize, with the relations that decide its nature.
const ACCOUNT_SELECT = {
  id: true,
  email: true,
  role: true,
  name: true,
  createdAt: true,
  staffProfile: { select: { id: true } },
  talent: {
    select: {
      id: true,
      prenom: true,
      nom: true,
      sfImport: { select: { sfEmail: true } },
    },
  },
  _count: { select: { sessions: true } },
} satisfies Prisma.bauth_userSelect;

type AccountRow = Prisma.bauth_userGetPayload<{
  select: typeof ACCOUNT_SELECT;
}>;

function summarize(a: AccountRow): AuthAccountSummary {
  return {
    id: a.id,
    email: a.email,
    role: a.role,
    name: a.name,
    createdAt: a.createdAt,
    sessions: a._count.sessions,
    isStaff: a.staffProfile !== null,
    linkedTalent: a.talent
      ? { id: a.talent.id, prenom: a.talent.prenom, nom: a.talent.nom }
      : null,
  };
}

/**
 * Lightweight count of invariant violations, for the admin nav badge. Computed
 * in SQL (a JOIN + case-insensitive compare) rather than by running the full
 * classification, so the layout load stays cheap.
 */
export async function countAuthIdentityConflicts(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM "Talent" t
    JOIN "bauth_user" u ON u.id = t."userId"
    JOIN "TalentSfImport" sf ON sf."talentId" = t."id"
    WHERE sf."sfEmail" IS NOT NULL
      AND lower(btrim(sf."sfEmail")) <> lower(btrim(u.email))
  `;
  return rows[0]?.count ?? 0;
}

/**
 * Full classification of every talent whose linked account email has drifted
 * from `Talent.email`. Read-only. Bounded work: the drift set is small (a
 * handful), and the supporting indexes are loaded once in memory rather than
 * per-row.
 */
export async function listAuthIdentityConflicts(): Promise<AuthConflict[]> {
  // 1. Candidates: linked talents whose email diverges from the linked account.
  //    Filtered down to genuine drift after normalizing both sides in memory
  //    (a DB-side case-insensitive compare can't be expressed across the
  //    relation as cleanly, and the set is tiny).
  const candidates = await prisma.talent.findMany({
    where: { userId: { not: null }, sfImport: { sfEmail: { not: null } } },
    select: {
      id: true,
      externalId: true,
      prenom: true,
      nom: true,
      sfImport: { select: { sfEmail: true } },
      user: { select: ACCOUNT_SELECT },
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const drifted = candidates.filter(
    (t) =>
      t.user &&
      norm(t.sfImport?.sfEmail) &&
      norm(t.sfImport?.sfEmail) !== norm(t.user.email),
  );
  if (drifted.length === 0) return [];

  // 2. Resolve the holder of each target/stale email in one query, plus the
  //    parent/talent email indexes needed for the verdict and the exposure
  //    (backward) check. Emails in bauth_user are written lowercased by every
  //    sign-in / link path, so an `in` over normalized values matches them.
  const lookupEmails = new Set<string>();
  for (const t of drifted) {
    const target = norm(t.sfImport?.sfEmail);
    const stale = norm(t.user!.email);
    if (target) lookupEmails.add(target);
    if (stale) lookupEmails.add(stale);
  }

  const accounts = await prisma.bauth_user.findMany({
    where: { email: { in: [...lookupEmails] } },
    select: ACCOUNT_SELECT,
  });
  const accountByEmail = new Map(accounts.map((a) => [norm(a.email)!, a]));

  // Index of every talent's own email and parent emails, to tell WHO a target /
  // stale email really belongs to (verdict, exposure, and the "who is this"
  // detail) and to confirm inversion symmetry.
  const allTalents = await prisma.talent.findMany({
    select: {
      id: true,
      prenom: true,
      nom: true,
      sfImport: { select: { sfEmail: true } },
      parentEmail: true,
      parent2Email: true,
    },
  });
  type Person = { id: string; prenom: string; nom: string };
  const talentByEmail = new Map<string, Person>();
  const parentEmailToTalent = new Map<string, Person>();
  for (const t of allTalents) {
    const person: Person = { id: t.id, prenom: t.prenom, nom: t.nom };
    const e = norm(t.sfImport?.sfEmail);
    if (e && !talentByEmail.has(e)) talentByEmail.set(e, person);
    for (const pe of [norm(t.parentEmail), norm(t.parent2Email)])
      if (pe && !parentEmailToTalent.has(pe))
        parentEmailToTalent.set(pe, person);
  }

  // What an account holding `email` is (orphan / staff / parent / talent), from
  // its relations first, then from who owns the email. `exceptTalentId` is the
  // talent being classified, so its own identity reads as `this_talent`.
  type HolderRow = (typeof accounts)[number];
  const holderNatureOf = (
    row: HolderRow | null,
    email: string,
    exceptTalentId: string,
  ): AccountNature | null => {
    if (!row) return null;
    if (row.staffProfile) return { kind: 'staff', name: row.name };
    if (row.talent)
      return row.talent.id === exceptTalentId
        ? { kind: 'this_talent' }
        : {
            kind: 'talent',
            talentId: row.talent.id,
            prenom: row.talent.prenom,
            nom: row.talent.nom,
            linked: true,
          };
    const p = parentEmailToTalent.get(email);
    if (p)
      return { kind: 'parent', talentId: p.id, prenom: p.prenom, nom: p.nom };
    const ot = talentByEmail.get(email);
    if (ot && ot.id !== exceptTalentId)
      return {
        kind: 'talent',
        talentId: ot.id,
        prenom: ot.prenom,
        nom: ot.nom,
        linked: false,
      };
    return { kind: 'orphan' };
  };

  // Who legitimately owns an email, ignoring the account that currently squats
  // it. null = nobody (a wrong value). Used for the stale email's exposure.
  const emailOwnerOf = (
    email: string,
    exceptTalentId: string,
  ): AccountNature | null => {
    const acc = accountByEmail.get(email);
    if (acc?.staffProfile) return { kind: 'staff', name: acc.name };
    const p = parentEmailToTalent.get(email);
    if (p)
      return { kind: 'parent', talentId: p.id, prenom: p.prenom, nom: p.nom };
    const ot = talentByEmail.get(email);
    if (ot && ot.id !== exceptTalentId)
      return {
        kind: 'talent',
        talentId: ot.id,
        prenom: ot.prenom,
        nom: ot.nom,
        linked: false,
      };
    return null;
  };

  const out: AuthConflict[] = [];
  for (const t of drifted) {
    const linkedRow = t.user!;
    const targetEmail = norm(t.sfImport?.sfEmail)!;
    const staleEmail = norm(linkedRow.email)!;
    const holderRow = accountByEmail.get(targetEmail) ?? null;

    // ── Forward: who holds the target email → the verdict. ────────────────
    let verdict: AuthConflictVerdict;
    let partnerTalentId: string | null = null;

    // No account holds the target email → the sync realigns the linked account
    // itself (changeUserEmail), so this is never a standing conflict. Skip it.
    if (!holderRow) continue;
    if (holderRow.staffProfile !== null) {
      verdict = 'STAFF_HOLDER';
    } else if (
      holderRow.role === 'parent' ||
      parentEmailToTalent.has(targetEmail)
    ) {
      verdict = 'PARENT_HOLDER';
    } else if (holderRow.talent) {
      // Held by another Talent B. Symmetric inversion ⇔ B's own email is the
      // stale email this talent is squatting (they are each other's), i.e. a
      // clean two-sided swap. Otherwise it is degraded and needs manual care.
      const symmetric = norm(holderRow.talent.sfImport?.sfEmail) === staleEmail;
      verdict = symmetric ? 'SYMMETRIC_INVERSION' : 'DEGRADED_INVERSION';
      partnerTalentId = holderRow.talent.id;
    } else {
      verdict = 'ORPHAN_HOLDER';
    }

    // ── Backward: does the stale email belong to a real, loggable identity? ──
    // If so, that person logging in lands on THIS talent's dashboard. `staleOwner`
    // carries the specific identity (for the detail); `exposureKind` is its tag.
    const staleOwner = emailOwnerOf(staleEmail, t.id);
    const exposureKind: ExposureKind | null =
      staleOwner?.kind === 'staff'
        ? 'staff'
        : staleOwner?.kind === 'parent'
          ? 'parent'
          : staleOwner?.kind === 'talent'
            ? 'talent'
            : null;

    out.push({
      talentId: t.id,
      externalId: t.externalId,
      prenom: t.prenom,
      nom: t.nom,
      targetEmail,
      linked: summarize(linkedRow),
      holder: holderRow ? summarize(holderRow) : null,
      verdict,
      holderNature: holderNatureOf(holderRow, targetEmail, t.id),
      staleOwner,
      exposureRisk: staleOwner !== null,
      exposureKind,
      partnerTalentId,
    });
  }

  // Surface the dangerous rows first: exposure, then the harder verdicts.
  const severity: Record<AuthConflictVerdict, number> = {
    DEGRADED_INVERSION: 0,
    STAFF_HOLDER: 1,
    PARENT_HOLDER: 2,
    SYMMETRIC_INVERSION: 3,
    ORPHAN_HOLDER: 4,
  };
  out.sort(
    (a, b) =>
      Number(b.exposureRisk) - Number(a.exposureRisk) ||
      severity[a.verdict] - severity[b.verdict] ||
      a.nom.localeCompare(b.nom),
  );
  return out;
}
