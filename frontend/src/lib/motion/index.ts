/**
 * The only door to `svelte/transition` (DESIGN.md § Motion).
 *
 * Every Svelte transition in the product goes through one of these, never
 * through `fly` or `fade` directly, and `lint:design` refuses the import
 * anywhere else. The reason is what happened before this module existed:
 * nineteen files each picked a duration, a distance and a delay, they drifted
 * to 400ms, 300px and uncapped staggers, and only one of them remembered that
 * some people ask their device for less motion.
 *
 * So the call site names what is happening (a block arriving, a step changing)
 * and this module owns how it moves, including what it does instead when
 * `prefers-reduced-motion` is set: the movement goes, the fade stays.
 */
import { fade as svelteFade, fly } from 'svelte/transition';
import type { TransitionConfig } from 'svelte/transition';
import { prefersReducedMotion } from 'svelte/motion';
import { DURATION, easeStandard } from './tokens';

export { DURATION } from './tokens';

type Direction = { direction?: 'in' | 'out' | 'both' };

/** A leaving element answers at `fast`, an arriving one settles at `base`. */
function durationFor(options?: Direction): number {
  return options?.direction === 'out' ? DURATION.fast : DURATION.base;
}

export type EnterParams = { x?: number; y?: number; delay?: number };

/**
 * What `enter` resolves to, kept pure so the reduced-motion contract is
 * testable without a DOM: asked for less motion, a block fades in place and
 * waits for nothing.
 */
export function enterParams(
  { x = 0, y = x ? 0 : 12, delay = 0 }: EnterParams,
  reduced: boolean,
): Required<EnterParams> {
  return reduced ? { x: 0, y: 0, delay: 0 } : { x, y, delay };
}

/**
 * A block arriving on a page: 12px up by default, or along `x` when given.
 *
 * SvelteKit does not play intros on the first, server-rendered paint, so this
 * runs on client navigation and on content that appears later, never as a
 * page-load show.
 */
export function enter(
  node: Element,
  params: EnterParams = {},
  options?: Direction,
): TransitionConfig {
  return fly(node, {
    ...enterParams(params, prefersReducedMotion.current),
    duration: durationFor(options),
    easing: easeStandard,
  });
}

/** The delay of item `index` in a list that enters together: 40ms apart, 160ms at most. */
export function stagger(index: number): number {
  return Math.min(index * 40, 160);
}

/** A fade, faster on the way out than on the way in. */
export function fade(
  node: Element,
  { delay = 0 }: { delay?: number } = {},
  options?: Direction,
): TransitionConfig {
  return svelteFade(node, {
    delay,
    duration: durationFor(options),
    easing: easeStandard,
  });
}

const STEP_DISTANCE = 16;

/**
 * The incoming step of a wizard (onboarding, closing, sign-in). It waits for
 * `stepOut` to finish, so the two never overlap: 120ms out, then 200ms in,
 * which keeps the whole change inside the 320ms ceiling.
 */
export function stepIn(node: Element): TransitionConfig {
  const reduced = prefersReducedMotion.current;
  return fly(node, {
    x: reduced ? 0 : STEP_DISTANCE,
    delay: DURATION.fast,
    duration: DURATION.base,
    easing: easeStandard,
  });
}

/**
 * The outgoing step, lifted out of the flow so the incoming one takes its
 * place at once. The parent must be `position: relative`.
 */
export function stepOut(): TransitionConfig {
  const x = prefersReducedMotion.current ? 0 : STEP_DISTANCE;
  return {
    duration: DURATION.fast,
    easing: easeStandard,
    css: (t, u) =>
      `position: absolute; top: 0; left: 0; right: 0; opacity: ${t}; transform: translateX(${-x * u}px);`,
  };
}
