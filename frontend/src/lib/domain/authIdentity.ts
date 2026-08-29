/**
 * Shared types + labels for the auth-identity conflict surface, importable from
 * both the server (`authIdentityService` / `authIdentityRepairService`) and the
 * client page. Pure domain data, no DB access, mirrors how
 * `$lib/domain/reconciliation` lets the sf-conflicts page share the field
 * catalogue with its server service.
 */

export type AuthConflictVerdict =
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

/** What an account / email maps to elsewhere in the system, for the expandable
 * "who is this" detail. */
export type AccountNature =
  | { kind: 'orphan' }
  | { kind: 'this_talent' }
  | {
      kind: 'talent';
      talentId: string;
      prenom: string;
      nom: string;
      /** true: the account is linked to that talent; false: the email is that
       * talent's login email but the account isn't theirs. */
      linked: boolean;
    }
  | { kind: 'parent'; talentId: string; prenom: string; nom: string }
  | { kind: 'staff'; name: string | null };

export interface AuthConflict {
  talentId: string;
  externalId: string | null;
  prenom: string;
  nom: string;
  /** The email SF says the student should log in with (TalentSfImport.sfEmail), normalized. */
  targetEmail: string;
  /** The account the Talent points to today, carrying the stale email. */
  linked: AuthAccountSummary;
  /** The account that already holds `targetEmail` (always set: a no-holder drift
   * is auto-realigned by the sync via changeUserEmail, so it is never listed). */
  holder: AuthAccountSummary | null;
  verdict: AuthConflictVerdict;
  /** What the holder account is (orphan / staff / parent / other talent). null
   * when there is no holder. Shown in the expandable detail. */
  holderNature: AccountNature | null;
  /** Who legitimately owns the stale email the linked account squats. null =
   * nobody (just a wrong value). Non-null ⇒ exposure risk. */
  staleOwner: AccountNature | null;
  /** Backward direction: is the stale email a real other person's? Derived from
   * `staleOwner` (kept for triage/badge convenience). */
  exposureRisk: boolean;
  exposureKind: ExposureKind | null;
  /** For SYMMETRIC_INVERSION: the partner talent to swap with. */
  partnerTalentId: string | null;
}

/** The repair operation a verdict maps to. `null` verdicts are escalate-only. */
export type AuthRepairAction = 'repointDrop' | 'swap' | 'sever';

/** French label per verdict, for the admin table. */
export const VERDICT_LABELS: Record<AuthConflictVerdict, string> = {
  ORPHAN_HOLDER: 'Orphelin actif',
  SYMMETRIC_INVERSION: 'Inversion symétrique',
  DEGRADED_INVERSION: 'Inversion dégradée',
  PARENT_HOLDER: 'Compte parent',
  STAFF_HOLDER: 'Compte staff',
};

/** The safe in-app repair for a verdict, or null when the row must be escalated
 * to Salesforce (parent/staff holder, degraded inversion) rather than forced. */
export function actionForVerdict(
  verdict: AuthConflictVerdict,
): AuthRepairAction | null {
  switch (verdict) {
    case 'ORPHAN_HOLDER':
      return 'repointDrop';
    case 'SYMMETRIC_INVERSION':
      return 'swap';
    default:
      return null;
  }
}

/** French label + short gloss per repair action, for buttons and the confirm
 * dialog. */
export const ACTION_LABELS: Record<AuthRepairAction, string> = {
  repointDrop: 'Basculer + supprimer l’ancien',
  swap: 'Échanger les deux comptes',
  sever: 'Couper le lien',
};

/** Human description of what an account / email maps to, for the detail panel. */
export function natureLabel(n: AccountNature | null): string {
  if (!n) return 'Personne (valeur sans propriétaire)';
  switch (n.kind) {
    case 'orphan':
      return 'Compte orphelin (rattaché à personne)';
    case 'this_talent':
      return 'Ce talent';
    case 'talent':
      return n.linked
        ? `Autre talent : ${n.prenom} ${n.nom} (compte lié)`
        : `Email d’un autre talent : ${n.prenom} ${n.nom}`;
    case 'parent':
      return `Parent de ${n.prenom} ${n.nom}`;
    case 'staff':
      return n.name ? `Compte staff : ${n.name}` : 'Compte staff';
  }
}
