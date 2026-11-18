/**
 * The online activities an event offers, walked by the talents it offered
 * them to, as far as production walks them.
 *
 * Until this scenario only a handful of walks were placed by hand, so on an
 * event that offers an activity nobody had done it, and « Mon parcours » showed
 * events with no XP under them where production shows the activity and what it
 * earned (#445). Both figures below are measured, never chosen
 * (`PROFILE.md`, « Activités en ligne »).
 *
 * It runs after the cohorts and their Salesforce statuses, because who an
 * activity is put in front of is an enrolment the dev space shows on an event
 * that has begun (`World.activityAudiences`), and before the scenarios that
 * place one talent per state, which own their walks.
 */
import type { Rng } from '../rng';
import { workshopSpec } from '../catalog/workshops';
import type { Scenario } from './types';

/**
 * The share of talents an activity was offered to who entered it: 278 talents
 * entered Pacman IA (`config_workshops`, `talentsEntered`) out of the 354
 * enrolments shown on the fifteen Halloween Camp 26 events that offered it
 * (`config_events`). An upper reading, since two of the seventeen events that
 * offer it are outside that count.
 */
const ENTRY_SHARE = 278 / 354;
// Applied to the talents who have signed in (`World.activityAudiences`), the
// only ones who can enter: a floor for their own share, which production does
// not give, since all 278 were among them.

/**
 * How far the 299 accounts that entered Pacman IA went, read off CTFd's own
 * statistics on the Halloween 2026 instance: how many validated each step of
 * its path, in order. The first step is the editor's tour, which nearly
 * everybody passes; part 1 ends at the ninth (183), part 2 starts at the
 * tenth (142) and only 33 reach its last.
 */
const ENTERED = 299;
const SOLVES_PER_STEP = [
  298, 295, 291, 286, 276, 262, 249, 200, 183, 142, 129, 60, 41, 33,
] as const;

/**
 * The share of a subject's path a talent who entered validated, drawn from
 * Pacman's measured funnel: the number of its steps whose solvers outnumber a
 * uniform draw, over its length. Kept as a share so a subject of another
 * length is walked to the same depth.
 */
function drawDepth(rng: Rng): number {
  const draw = rng.next() * ENTERED;
  const reached = SOLVES_PER_STEP.filter((solves) => solves > draw).length;
  return reached / SOLVES_PER_STEP.length;
}

export const activityWalks: Scenario = {
  name: 'activites-faites',
  summary:
    'Les activités proposées par un événement, faites par une part de ceux qu’il a reçus et aussi loin que la production les fait.',
  run(world) {
    // Its own stream: how many walks it draws depends on the catalogue and the
    // cohorts, and must move nothing any other scenario draws.
    const rng = world.ctx.rng.fork('activityWalks');
    // A talent decides once per activity, the first time it is offered to
    // them: a Coding Club regular is offered the same subject every session,
    // and a draw per session would have almost every regular enter it, where
    // the measure counts each talent once.
    const decided = new Set<string>();
    for (const {
      event,
      talent,
      firstLoginAt,
      slugs,
    } of world.activityAudiences()) {
      for (const slug of slugs) {
        const key = `${talent.id}:${slug}`;
        if (decided.has(key) || world.hasWalked(talent.id, slug)) continue;
        decided.add(key);
        if (!rng.chance(ENTRY_SHARE)) continue;
        const steps = workshopSpec(slug).stepValues.length;
        world.enterWorkshop({
          talent,
          event,
          slug,
          solvedSteps: Math.round(drawDepth(rng) * steps),
          // Entered on the event's first day, or on the talent's first
          // sign-in when that came later; the date dates its XP too.
          at: new Date(Math.max(event.date.getTime(), firstLoginAt.getTime())),
          celebrated: true,
        });
      }
    }
  },
};
