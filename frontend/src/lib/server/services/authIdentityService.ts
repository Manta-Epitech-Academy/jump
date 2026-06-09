import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';

/**
 * Auth-identity conflicts: the login-layer sibling of `reconciliationService`.
 *
 * `reconciliationService` diffs the *data* layer (`Talent` vs the
 * `TalentSfImport` mirror). This service diffs the *identity* layer: the
 * `bauth_user` a talent is linked to (`Talent.userId`) versus the email that
 * talent should log in with (`Talent.email`).
 *
 * The single invariant that makes login work:
 *
 *   the `bauth_user` pointed to by `Talent.userId` must carry the same email as
 *   `Talent.email` (normalized).
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

/**
 * What kind of account already holds the talent's target email, which decides
 * the only safe resolution for the row.
 *
 *  - SIMPLE_DRIFT        nobody holds `Talent.email`. The linked account can
 *                        simply be renamed to it (what the backfill does). The
 *                        root-cause fix to `ensureTalentUser` tarets this class
 *                        at next login; rarely needs the admin tool.
 *  - ORPHAN_HOLDER       held by an account with no talent / staff / parent
 *                        link. Repoint the Talent onto it (it is where the live
 *                        sessions are) and drop the stale account.
 *  - SYMMETRIC_INVERSION held by another Talent, and the cross is symmetric
 *                        (their emails are each other's). A temp-value swap
 *                        fixes both talents at once.
 *  - DEGRADED_INVERSION  held by another Talent, but NOT symmetric. No automatic
 *                        move is provably correct; needs human, two-sided care.
 *  - PARENT_HOLDER       held by a parent login. A student cannot log in with a
 *                        parent's email: an SF data anomaly, escalate, never
 *                        force.
 *  - STAFF_HOLDER        held by a staff account. Same: escalate, never force.
 */
export type AuthConflictVerdict =
  | 'SIMPLE_DRIFT'
  | 'ORPHAN_HOLDER'
  | 'SYMMETRIC_INVERSION'
  | 'DEGRADED_INVERSION'
  | 'PARENT_HOLDER'
  | 'STAFF_HOLDER';

/** What the stale email the linked account squats actually belongs to. When it
 * is a real, loggable identity, that person logging in lands on THIS talent's
 * dashboard: a cross-account data exposure (minors → RGPD). Drives triage. */
export type ExposureKind = 'talent' | 'parent' | 'staff';

export interface AuthAccountSummary {
  id: string;
  email: string;
  role: string;
  name: string | null;
  createdAt: Date;
  sessions: number;
  /** True when this account carries a staffProfile (the reliable staff signal,
   * more so than the `role` string). */
  isStaff: boolean;
  /** The talent this account is linked to, if any (its `bauth_user.talent`). */
  linkedTalent: { id: string; prenom: string; nom: string } | null;
}

export interface AuthConflict {
  talentId: string;
  externalId: string | null;
  prenom: string;
  nom: string;
  /** The email the student should log in with (Talent.email), normalized. */
  targetEmail: string;
  /** The account the Talent points to today, carrying the stale email. */
  linked: AuthAccountSummary;
  /** The account that already holds `targetEmail`, if any. null → SIMPLE_DRIFT. */
  holder: AuthAccountSummary | null;
  verdict: AuthConflictVerdict;
  /** Backward direction: is the stale email a real other person's? */
  exposureRisk: boolean;
  exposureKind: ExposureKind | null;
  /** For SYMMETRIC_INVERSION: the partner talent to swap with. */
  partnerTalentId: string | null;
}

// The bauth_user shape we summarize, with the relations that decide its nature.
const ACCOUNT_SELECT = {
  id: true,
  email: true,
  role: true,
  name: true,
  createdAt: true,
  staffProfile: { select: { id: true } },
  talent: { select: { id: true, prenom: true, nom: true, email: true } },
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
    WHERE t.email IS NOT NULL
      AND lower(btrim(t.email)) <> lower(btrim(u.email))
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
    where: { userId: { not: null }, email: { not: null } },
    select: {
      id: true,
      externalId: true,
      prenom: true,
      nom: true,
      email: true,
      user: { select: ACCOUNT_SELECT },
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const drifted = candidates.filter(
    (t) => t.user && norm(t.email) && norm(t.email) !== norm(t.user.email),
  );
  if (drifted.length === 0) return [];

  // 2. Resolve the holder of each target/stale email in one query, plus the
  //    parent/talent email indexes needed for the verdict and the exposure
  //    (backward) check. Emails in bauth_user are written lowercased by every
  //    sign-in / link path, so an `in` over normalized values matches them.
  const lookupEmails = new Set<string>();
  for (const t of drifted) {
    const target = norm(t.email);
    const stale = norm(t.user!.email);
    if (target) lookupEmails.add(target);
    if (stale) lookupEmails.add(stale);
  }

  const accounts = await prisma.bauth_user.findMany({
    where: { email: { in: [...lookupEmails] } },
    select: ACCOUNT_SELECT,
  });
  const accountByEmail = new Map(accounts.map((a) => [norm(a.email)!, a]));

  // Index of every talent's own email and parent emails, to tell who a stale
  // email really belongs to (exposure) and to confirm inversion symmetry.
  const allTalents = await prisma.talent.findMany({
    select: {
      id: true,
      email: true,
      userId: true,
      parentEmail: true,
      parent2Email: true,
    },
  });
  const talentByEmail = new Map<
    string,
    { id: string; userId: string | null }
  >();
  const parentEmails = new Set<string>();
  for (const t of allTalents) {
    const e = norm(t.email);
    if (e && !talentByEmail.has(e))
      talentByEmail.set(e, { id: t.id, userId: t.userId });
    for (const pe of [norm(t.parentEmail), norm(t.parent2Email)])
      if (pe) parentEmails.add(pe);
  }

  const out: AuthConflict[] = [];
  for (const t of drifted) {
    const linkedRow = t.user!;
    const targetEmail = norm(t.email)!;
    const staleEmail = norm(linkedRow.email)!;
    const holderRow = accountByEmail.get(targetEmail) ?? null;

    // ── Forward: who holds the target email → the verdict. ────────────────
    let verdict: AuthConflictVerdict;
    let partnerTalentId: string | null = null;

    if (!holderRow) {
      verdict = 'SIMPLE_DRIFT';
    } else if (holderRow.staffProfile !== null) {
      verdict = 'STAFF_HOLDER';
    } else if (holderRow.role === 'parent' || parentEmails.has(targetEmail)) {
      verdict = 'PARENT_HOLDER';
    } else if (holderRow.talent) {
      // Held by another Talent B. Symmetric inversion ⇔ B's own email is the
      // stale email this talent is squatting (they are each other's), i.e. a
      // clean two-sided swap. Otherwise it is degraded and needs manual care.
      const symmetric = norm(holderRow.talent.email) === staleEmail;
      verdict = symmetric ? 'SYMMETRIC_INVERSION' : 'DEGRADED_INVERSION';
      partnerTalentId = holderRow.talent.id;
    } else {
      verdict = 'ORPHAN_HOLDER';
    }

    // ── Backward: does the stale email belong to a real, loggable identity? ──
    // If so, that person logging in lands on THIS talent's dashboard.
    let exposureKind: ExposureKind | null = null;
    const staleAsStaff = accountByEmail.get(staleEmail);
    if (staleAsStaff?.staffProfile) exposureKind = 'staff';
    else if (parentEmails.has(staleEmail)) exposureKind = 'parent';
    else {
      const other = talentByEmail.get(staleEmail);
      // Another talent legitimately owns this email (not this same talent).
      if (other && other.id !== t.id) exposureKind = 'talent';
    }

    out.push({
      talentId: t.id,
      externalId: t.externalId,
      prenom: t.prenom,
      nom: t.nom,
      targetEmail,
      linked: summarize(linkedRow),
      holder: holderRow ? summarize(holderRow) : null,
      verdict,
      exposureRisk: exposureKind !== null,
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
    SIMPLE_DRIFT: 5,
  };
  out.sort(
    (a, b) =>
      Number(b.exposureRisk) - Number(a.exposureRisk) ||
      severity[a.verdict] - severity[b.verdict] ||
      a.nom.localeCompare(b.nom),
  );
  return out;
}

/**
 * Single-talent classification, for the CLI diagnostic. Returns null when the
 * talent's link is already aligned (no conflict). Reuses the same logic as the
 * list by filtering it, so the two can never disagree.
 */
export async function getAuthConflictForTalent(
  talentId: string,
): Promise<AuthConflict | null> {
  const all = await listAuthIdentityConflicts();
  return all.find((c) => c.talentId === talentId) ?? null;
}
