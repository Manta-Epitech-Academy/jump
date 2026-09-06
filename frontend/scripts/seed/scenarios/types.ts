/**
 * A scenario is a named situation somebody can ask for by name.
 *
 * That is the whole contract, and the name is the important half: it is what a
 * PO writes in a bug report and what a developer types to reproduce it. A
 * scenario that cannot be named in a sentence is a scenario nobody will find.
 *
 * Each declares what it makes testable. The manifest is built from those
 * declarations, so the "where do I find what" page cannot drift from what the
 * run actually produced: it is not written, it is reported.
 */

import type { World } from '../world';

export type Scenario = {
  /** Kebab-case and stable. Referenced in bug reports, so renaming one costs. */
  readonly name: string;
  readonly summary: string;
  readonly run: (world: World) => void | Promise<void>;
};
