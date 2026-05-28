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

/** True once the guardian has made any decision — the chase can stop. */
export function isImageRightsDecided(talent: {
  imageRightsDecidedAt: Date | string | null;
}): boolean {
  return talent.imageRightsDecidedAt != null;
}
