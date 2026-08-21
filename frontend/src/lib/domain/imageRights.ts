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
  | ImageRightsDecision
  | 'awaiting_parent'
  | 'pending';

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

/** True once the guardian has made any decision — the chase can stop. */
export function isImageRightsDecided(talent: {
  imageRightsDecidedAt: Date | string | null;
}): boolean {
  return talent.imageRightsDecidedAt != null;
}
