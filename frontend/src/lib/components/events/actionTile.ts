/**
 * The square tile an event's home lays its actions out on, as the 2027 mockup
 * draws them: icon over a label that wraps, the button's face and type
 * (`DESIGN.md`), on a 112px square from `sm` up and half the row below it,
 * where four squares would not fit a phone. A class rather than a component,
 * because the tiles are different controls (a dialog, a download, the
 * Salesforce link's own button) wearing one shape.
 */
export const ACTION_TILE_CLASS =
  'h-28 w-full flex-col gap-2.5 whitespace-normal px-3 text-center text-xs leading-snug sm:w-28 [&_svg]:size-5';
