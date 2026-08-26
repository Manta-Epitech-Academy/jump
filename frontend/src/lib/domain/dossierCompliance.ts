import { isImageRightsDecided, type ImageRightsStatus } from './imageRights';
import { isOnboardingEligible } from './niveau';

/**
 * Shared predicates for dossier compliance. One module so the cohort funnel,
 * the per-event onboarding table and the per-student dossier banner never
 * drift on what counts as "compliant".
 *
 * Named for the dossier, not for the stage: with one generic règlement signed
 * once, these predicates serve every kind of event, Coding Clubs included.
 *
 * Bare positional args (not a participation shape) so the predicates work
 * uniformly across the two call shapes that exist:
 *  - cohort view: many talents, the signal lives nested on each row's talent
 *  - per-student view: one talent, the signal is hoisted alongside the
 *    participation list
 * Callers extract the values; the predicates just own the truth.
 */

/**
 * Règlement intérieur compliance: the legal guardian co-signed online.
 *
 * There used to be a second accepted signal, a per-participation staff
 * attestation of an offline signature (`StageCompliance.charteSigned`). No code
 * path could ever set it, so in production it was always false, and it is gone.
 * If an offline attestation is wanted again it belongs to the talent or to
 * their yearly dossier, never to one participation: the règlement is signed
 * once, not once per event.
 */
export function isRulesCompliant(
  parentRulesSignedAt: Date | string | null | undefined,
): boolean {
  return parentRulesSignedAt != null;
}

/**
 * Whether a legal guardian owes nothing further: they co-signed the règlement
 * AND settled the image-rights decision (a refusal settles it). The two acts of
 * the parent flow, so this is exactly "will this parent be asked for something
 * when they next log in", inverted.
 *
 * **Read the talent's own columns, never a year-narrowed view of them.** The two
 * fields are both projections of the talent's most recent dossier, so reading
 * them as they stand already answers "for the dossier in hand", which is the
 * question. Narrowing them onto a named year turns this into an aggregate's
 * question instead, and a surface that did that promised a chase nobody was
 * running: the admin directory's chip read "En attente" for every talent whose
 * dossier predated the cutover while its own filter and KPI tile counted them
 * complete.
 *
 * A guardian is re-asked when their child reopens a dossier, and that is already
 * visible here, because reopening one moves the projection. That now holds for
 * BOTH acts: the image-rights decision became annual and joined the projection,
 * so a returning family is asked for both again, from this one predicate.
 *
 * This is emphatically not the predicate that decides whether a photo may be
 * published (`imageRightsStance` in `domain/imageRights.ts`). What a guardian
 * owes is a question about a dossier; what applies to a student is not.
 *
 * `db/dossierCompliance.ts` holds the SQL twins of this predicate and reads the
 * same two fields, so a filter and a badge cannot disagree.
 */
export function isParentDossierComplete(t: {
  parentRulesSignedAt: Date | string | null | undefined;
  imageRightsDecidedAt: Date | string | null;
}): boolean {
  return isRulesCompliant(t.parentRulesSignedAt) && isImageRightsDecided(t);
}

/** The three display states a règlement intérieur signature can be in. */
export type RulesStatus = 'signed' | 'awaiting_parent' | 'pending';

/** UI labels (French) keyed by the resolved règlement status. */
export const RULES_STATUS_LABELS: Record<RulesStatus, string> = {
  signed: 'Signé',
  awaiting_parent: 'Attente parent',
  pending: 'En attente',
};

/**
 * Resolves the displayable règlement status from its two signals. Mirrors
 * {@link isRulesCompliant} for the "done" case, then splits the not-done case
 * into the actionable "chase the parent" state (student signed, guardian
 * co-signature still pending) versus "nothing signed yet". One definition so
 * the per-student rail and the cohort table never drift on the wording.
 */
export function rulesStatus(
  parentRulesSignedAt: Date | string | null | undefined,
  rulesSignedAt: Date | string | null | undefined,
): RulesStatus {
  if (isRulesCompliant(parentRulesSignedAt)) return 'signed';
  if (rulesSignedAt != null) return 'awaiting_parent';
  return 'pending';
}

/**
 * The inscrit's stage in the admission funnel, the single state the cohort badge
 * shows. Gated on connection first, then the two dossier gates (règlement
 * intérieur + droit à l'image): a student who never logged in is the most urgent
 * case and must read distinctly from one who connected but still owes documents.
 * One definition shared by the inscrits table, its statut filter and the XLSX
 * export so they never drift.
 */
export type InscritStatus =
  | 'no_dossier'
  | 'never_connected'
  | 'in_progress'
  | 'ready';

/**
 * UI labels (French) keyed by the funnel state. `never_connected` is the short
 * "Jamais" on purpose, so the pill and filter chip stay as compact as the other
 * two; the badge tooltip spells out the full "Jamais connecté".
 */
export const INSCRIT_STATUS_LABELS: Record<InscritStatus, string> = {
  no_dossier: 'Pas de dossier',
  never_connected: 'Jamais',
  in_progress: 'En cours',
  ready: 'Prêt',
};

/**
 * Tooltip for the one chip whose label omits its reason. The Niveau column sits
 * on the same row and already names the level, so spending chip width on
 * "(collégien)" repeats what the row shows.
 */
export const NO_DOSSIER_HINT =
  "Collégien : pas de parcours d'inscription sur Jump.";

/**
 * Folds level + connection + the two per-document statuses into the badge's
 * four states:
 *  - `no_dossier`      : a collégien. Checked first, and it outranks every
 *                        other signal: they have no dossier to open, so
 *                        "Jamais" would read as something to chase and
 *                        "En cours" would be untrue. They would otherwise sit
 *                        in `in_progress` for good.
 *  - `never_connected` — the talent never logged in (no real `bauth_session`).
 *                        Most urgent of the remaining three: nothing in the
 *                        dossier can move until they connect, so it reads red
 *                        regardless of document state.
 *  - `ready`           — connected AND both gates done: règlement signed AND
 *                        image-rights decided.
 *  - `in_progress`     — connected but not both gates done. Subsumes the old
 *                        "partial" (some motion) and the connected slice of the
 *                        old "empty" (nothing signed yet).
 *
 * `niveau` comes first because it decides whether the rest is even asked.
 */
export function inscritStatus(
  niveau: string | null | undefined,
  connected: boolean,
  rules: RulesStatus,
  image: ImageRightsStatus,
): InscritStatus {
  if (!isOnboardingEligible(niveau)) return 'no_dossier';
  if (!connected) return 'never_connected';
  if (rules === 'signed' && image !== 'undecided') return 'ready';
  return 'in_progress';
}
