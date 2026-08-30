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
import { operations } from './operations';
import type { Scenario } from './types';

export const SCENARIOS: readonly Scenario[] = [
  platform,
  stage,
  club,
  longTail,
  edgeTalents,
  operations,
];

export type { Scenario };
