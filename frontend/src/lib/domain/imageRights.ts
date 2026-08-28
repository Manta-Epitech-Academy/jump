/**
 * Single source of truth for the image-rights *decision* — the legal guardian's
 * choice to authorize, or refuse, the use of their child's image.
 *
 * The decision is talent-level and ternary: `accepted`, `refused`, or undecided
 * (modelled as `null` on {@link Talent.imageRightsDecision}). A refusal is a
 * settled, final outcome — it is not "not yet signed", it means *do not
 * photograph this student*. Keep that distinction here so the parent flow, the
 * staff cohort view, broadcasts and relances all agree on the three states.
 */
import type { ImageRightsDecision } from '@prisma/client';

export type { ImageRightsDecision };

/** The three states a guardian's image-rights decision can be in. */
export type ImageRightsStatus = ImageRightsDecision | 'undecided';

export const IMAGE_RIGHTS_DECISIONS = [
  'accepted',
  'refused',
] as const satisfies readonly ImageRightsDecision[];

/** UI labels (French) keyed by the resolved three-state status. */
export const IMAGE_RIGHTS_STATUS_LABELS: Record<ImageRightsStatus, string> = {
  accepted: 'Autorisé',
  refused: 'Refusé',
  undecided: 'En attente',
};

/**
 * Resolves the displayable status from the two stored fields. The invariant
 * (`decision` and `decidedAt` are set/cleared together) means `decision` alone
 * is authoritative; `decidedAt` is carried only for the "when" and the chase.
 */
export function imageRightsStatus(talent: {
  imageRightsDecision: ImageRightsDecision | null;
}): ImageRightsStatus {
  return talent.imageRightsDecision ?? 'undecided';
}

/**
 * Display-only status for the dossier breakdown, made parallel to
 * {@link RulesStatus} so the règlement and droit-à-l'image rows read
 * consistently. The image decision is the guardian's alone, so it has no
 * student step of its own. But the same parent flow co-signs the règlement and
 * decides the image, both invited by the student's own online signature. So an
 * *undecided* image splits the way the règlement does: "awaiting parent" once
 * the student has signed (`studentSigned`, which is what invites the guardian),
 * else "pending". A settled decision (`accepted` / `refused`) passes through
 * unchanged.
 *
 * `studentSigned` must be the student's own signature (`rulesSignedAt != null`),
 * not "the règlement is satisfied": the student's signature is what invites the
 * guardian, whereas satisfaction means the guardian already co-signed. Folding
 * the latter in would leave an undecided image reading "pending" for a family
 * that has in fact been asked.
 */
export type ImageRightsDisplayStatus =
  ImageRightsDecision | 'awaiting_parent' | 'pending';

/** UI labels (French); the two undecided splits mirror `RULES_STATUS_LABELS`. */
export const IMAGE_RIGHTS_DISPLAY_LABELS: Record<
  ImageRightsDisplayStatus,
  string
> = {
  accepted: 'Autorisé',
  refused: 'Refusé',
  awaiting_parent: 'Attente parent',
  pending: 'En attente',
};

export function imageRightsDisplayStatus(
  status: ImageRightsStatus,
  studentSigned: boolean,
): ImageRightsDisplayStatus {
  if (status !== 'undecided') return status;
  return studentSigned ? 'awaiting_parent' : 'pending';
}

/**
 * True once the guardian has decided for the dossier in hand, so the chase can
 * stop.
 *
 * Read off the flat columns on `Talent` this is a question about the talent's
 * MOST RECENT dossier, not about their whole history: the columns are a
 * projection of that dossier (`domain/talentOnboarding.ts`), so a returning
 * talent who reopens one puts their guardian back in the chase, which is the
 * point. Read off an `Onboarding_Record` it is that year's question directly.
 *
 * It is therefore NOT the predicate that decides whether a photo may be
 * published: see {@link imageRightsStance}, which is deliberately not a year
 * question.
 */
export function isImageRightsDecided(talent: {
  imageRightsDecidedAt: Date | string | null;
}): boolean {
  return talent.imageRightsDecidedAt != null;
}

/**
 * What staff may actually do with this student's likeness right now.
 *
 * The third and last reading of the image-rights data, and the only one that is
 * not about a school year. A consent expires; an interdiction does not. The year
 * decides whether the guardian is ASKED again, it does not decide what applies
 * in the meantime, and conflating the two is how a refusal disappears from a
 * printed badge on the first day of a new school year while nothing reports it.
 *
 *  - `authorized` the guardian authorized for the dossier in hand.
 *  - `forbidden`  they refused for the dossier in hand, OR nothing is decided
 *                 for it and the last decision they ever made was a refusal.
 *  - `unknown`    nothing is decided and no refusal stands. **Not an
 *                 authorization.** A lapsed authorization lands here, because
 *                 last year's yes does not cover this year's photo.
 *
 * Only `forbidden` is surfaced as a marker on printed material. Marking every
 * `unknown` would put a marker on most of the cohort every September and the
 * marker would stop being read, which is a worse outcome than not printing it.
 * The staff screens show all three, since there the reader is deciding rather
 * than scanning.
 *
 * Bare positional args, like the rest of this module: the two values come from
 * different places (the projection or a dossier row for the first, the latest
 * ledger row for the second) and no caller has them on one object.
 */
export type ImageRightsStance = 'authorized' | 'forbidden' | 'unknown';

/** UI labels (French) keyed by the resolved stance. */
export const IMAGE_RIGHTS_STANCE_LABELS: Record<ImageRightsStance, string> = {
  authorized: 'Autorisé',
  forbidden: 'Ne pas photographier',
  unknown: 'Sans autorisation',
};

export function imageRightsStance(
  /** The decision for the dossier in hand, from {@link imageRightsStatus}. */
  current: ImageRightsStatus,
  /**
   * The decision of the most recent `ImageRightsDecisionRecord`, all school
   * years taken together, or null when the guardian never decided anything.
   */
  lastKnown: ImageRightsDecision | null,
): ImageRightsStance {
  if (current === 'accepted') return 'authorized';
  if (current === 'refused') return 'forbidden';
  return lastKnown === 'refused' ? 'forbidden' : 'unknown';
}

/**
 * One decision as every reader of the ledger needs it: what was chosen, and
 * which school year it answered for.
 */
export interface ImageRightsDecisionSummary {
  decision: ImageRightsDecision;
  schoolYear: string;
}

/**
 * The decision to REMIND a guardian of, when asking them again.
 *
 * Not the same question as {@link imageRightsStance}, and the difference is the
 * word "prior": a guardian meeting this question for a new school year is
 * answering blind unless they are shown what they said last time, but a guardian
 * re-opening their own in-force decision to change it must not be told they
 * "avaient" decided and that the question is being re-asked. It is not, they are
 * changing their mind inside one year.
 *
 * So the rule is one comparison, stated once here rather than left to whichever
 * branch of whichever page happens to render the form: the latest decision
 * counts as a reminder only when it belongs to a year other than the dossier
 * being decided now.
 */
export function priorYearDecision(
  latest: ImageRightsDecisionSummary | null | undefined,
  dossierSchoolYear: string | null | undefined,
): ImageRightsDecisionSummary | null {
  if (!latest) return null;
  return latest.schoolYear === dossierSchoolYear ? null : latest;
}
