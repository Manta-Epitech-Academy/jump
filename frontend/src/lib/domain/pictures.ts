/**
 * A picture Jump copied from an address an admin gave (`images/remote.ts`) and
 * serves itself, as a page draws it: its own URL, its intrinsic size so the box
 * is reserved before the bytes land, and, for an animation, the URL of its
 * first frame, what a talent who asked for reduced motion sees instead.
 *
 * Any proportion and any size reach a page: a picture is never refused for its
 * shape, so every place that draws one bounds it (`CopiedPicture`).
 */
export type ShownPicture = {
  url: string;
  width: number;
  height: number;
  /** The still of an animation; null for a still. */
  stillUrl: string | null;
};

/** The picture as it shows without moving: its still for an animation, itself otherwise. */
export function motionlessUrl(picture: ShownPicture): string {
  return picture.stillUrl ?? picture.url;
}

/**
 * What a talent who asked for reduced motion sees in place of `picture`, or
 * null when `picture` already holds still. `chosen` is a still its author
 * picked (a cover's poster) and wins over the first frame Jump derived. Any
 * picture is taken in any place, so `chosen` may itself be an animation, and
 * it is reduced like the rest rather than trusted to hold still.
 */
export function reducedMotionUrl(
  picture: ShownPicture,
  chosen: ShownPicture | null = null,
): string | null {
  const url = motionlessUrl(chosen ?? picture);
  return url === picture.url ? null : url;
}

/**
 * The storage key of an animation's still, beside the animation's own key. Pure,
 * so the seed composes it the same way the copy does.
 */
export function stillKeyOf(key: string): string {
  return key.replace(/\.[^./]+$/, '') + '-still.webp';
}
