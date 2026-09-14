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
import { minigames } from './minigames';
import { careers } from './careers';
import { sfStatuses } from './sfStatuses';
import { operations } from './operations';
import type { Scenario } from './types';

export const SCENARIOS: readonly Scenario[] = [
  platform,
  stage,
  club,
  longTail,
  edgeTalents,
  // After every cohort, because it draws its players from the whole talent
  // population: run earlier, and the 12.4% who play would all come from
  // whichever campaign happened to have been built by then.
  minigames,
  // After `minijeux`, and that is a dependency. A rank is computed from the
  // field (`World.rankMinigameFields`), so placing a WIN means placing a better
  // result than the rest of the field - which has to exist first.
  careers,
  // Between these two on purpose: the status draw is consumed in enrol order,
  // so inserting here leaves every existing enrolment at the position it had.
  sfStatuses,
  operations,
];

export type { Scenario };
