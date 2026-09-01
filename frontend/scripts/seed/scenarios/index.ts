/**
 * The scenario list, in run order.
 *
 * Order is a dependency, not a preference: `platform` builds the campuses,
 * schools and staff everything else attaches to, and `operations` reads rows the
 * event scenarios created. Adding a scenario means adding it here, which is also
 * how the manifest learns about it.
 */

import { platform } from './platform';
import { stage } from './stage';
import { club } from './club';
import { longTail } from './longTail';
import { edgeTalents } from './edgeTalents';
import { sfStatuses } from './sfStatuses';
import { operations } from './operations';
import type { Scenario } from './types';

export const SCENARIOS: readonly Scenario[] = [
  platform,
  stage,
  club,
  longTail,
  edgeTalents,
  // Between these two on purpose: the status draw is consumed in enrol order,
  // so inserting here leaves every existing enrolment at the position it had.
  sfStatuses,
  operations,
];

export type { Scenario };
