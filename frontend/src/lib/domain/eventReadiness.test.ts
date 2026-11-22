/**
 * The two configuration rules an event is read by, and the one place they now
 * live.
 *
 * Worth pinning rather than eyeballing because both were duplicated before this,
 * and the duplication was invisible: `missing` was written character for
 * character in two aggregates a reader compares side by side, and the activation
 * rule existed as a Prisma `where`, as a hand-copied predicate, and as a French
 * sentence that listed all three causes with "or" because it could not tell which
 * one applied.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readsWithout, walk } from '#lib/testing/sourceReads.ts';
import {
  activationBlockers,
  canBeMadeVisible,
  eventMissingConfig,
  EVENT_MISSING_LABELS,
  eventConfigState,
  isEventShown,
  preparationHorizon,
  shownEventWhere,
  type EventConfigFields,
} from './eventReadiness';

const configured: EventConfigFields = {
  publicName: 'Stage Web Été 2026',
  cohortNoun: 'stagiaire',
  modules: ['inscrits'],
  devActivated: true,
};

describe('eventMissingConfig', () => {
  it('is empty on a fully configured, activated event', () => {
    expect(eventMissingConfig(configured)).toEqual([]);
  });

  it('lists every unset field, in the order a human would fix them', () => {
    expect(
      eventMissingConfig({
        publicName: '',
        cohortNoun: null,
        modules: [],
        devActivated: false,
      }),
    ).toEqual([
      EVENT_MISSING_LABELS.publicName,
      EVENT_MISSING_LABELS.cohortNoun,
      EVENT_MISSING_LABELS.modules,
    ]);
  });

  // "No section" and "not activated yet" are one rung, not two: an event with no
  // section shows nothing whatever the gate says, so naming both would send the
  // reader to flip a switch that changes nothing.
  it('asks for the activation only once a section exists', () => {
    expect(
      eventMissingConfig({ ...configured, modules: [], devActivated: false }),
    ).toEqual([EVENT_MISSING_LABELS.modules]);
    expect(eventMissingConfig({ ...configured, devActivated: false })).toEqual([
      EVENT_MISSING_LABELS.activation,
    ]);
  });
});

describe('activationBlockers', () => {
  it('is empty when activating would actually show something', () => {
    expect(activationBlockers({ ...configured, devActivated: false })).toEqual(
      [],
    );
    expect(canBeMadeVisible({ ...configured, devActivated: false })).toBe(true);
  });

  it('names what this event lacks, not every possibility', () => {
    expect(activationBlockers({ ...configured, publicName: null })).toEqual([
      EVENT_MISSING_LABELS.publicName,
    ]);
  });

  // The gap this closes: `configState` calls such an event `ready` ("Prêt à
  // publier", one toggle from live) while the activation write refuses it.
  it('refuses an event with sections but no public name, which reads as ready', () => {
    expect(canBeMadeVisible({ ...configured, publicName: '' })).toBe(false);
  });

  // The write does not check the cohort noun, so listing it here would refuse an
  // activation that in fact succeeds.
  it('ignores the cohort noun, which blocks nothing', () => {
    const noNoun = { ...configured, cohortNoun: null };
    expect(eventMissingConfig(noNoun)).toContain(
      EVENT_MISSING_LABELS.cohortNoun,
    );
    expect(activationBlockers(noNoun)).toEqual([]);
  });
});

// The weekly digest leads with the imminent band, so an event filed one band
// too late is one nobody prepares in time.
describe('preparationHorizon', () => {
  const today = '2026-11-09';

  it('counts calendar days, the seventh still this week and the twenty-first still soon', () => {
    expect(preparationHorizon('upcoming', '2026-11-16', today)).toBe(
      'imminent',
    );
    expect(preparationHorizon('upcoming', '2026-11-17', today)).toBe('soon');
    expect(preparationHorizon('upcoming', '2026-11-30', today)).toBe('soon');
    expect(preparationHorizon('upcoming', '2026-12-01', today)).toBe('later');
  });

  it('holds across a month and a year end', () => {
    expect(preparationHorizon('upcoming', '2027-01-04', '2026-12-28')).toBe(
      'imminent',
    );
  });

  it('treats an event under way as imminent and a finished one as having no horizon', () => {
    expect(preparationHorizon('ongoing', '2026-11-02', today)).toBe('imminent');
    expect(preparationHorizon('past', '2026-11-02', today)).toBeNull();
  });
});

// The rule every non-admin surface reads events through (#516), spelled three
// ways: a `where` for queries, a predicate for loaded rows, and the `shown`
// state the admin cockpit reports. What this catches is a condition added to
// one spelling and not the others; behaviour is pinned on real SQL in the
// integration suites.
describe('shownEventWhere', () => {
  it('reads the same fields as isEventShown', () => {
    expect(Object.keys(shownEventWhere).sort()).toEqual([
      'devActivatedAt',
      'modules',
    ]);
  });

  it('agrees with isEventShown and eventConfigState on every combination', () => {
    for (const activated of [true, false]) {
      for (const modules of [[], ['inscrits']]) {
        const row = { devActivatedAt: activated ? new Date() : null, modules };
        const state = eventConfigState({
          devActivated: activated,
          moduleCount: modules.length,
        });
        expect(isEventShown(row)).toBe(state === 'shown');
        expect(isEventShown(row)).toBe(activated && modules.length > 0);
      }
    }
  });
});

/**
 * A read of an event, or of an enrolment (a delegate call, or a relation
 * filter on them), and the names that carry the rule into it: the rule itself
 * in either spelling, and the fragments built on it. `participations: true`
 * is a read too, with no filter at all: the parent home counted a child's
 * enrolments that way before #516.
 */
const EVENT_READ =
  /\b(participation|event)\.(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|groupBy|aggregate)\(|\bparticipations:\s*(\{|true\b)/g;
const SHOWN_MARKERS = [
  'shownEventWhere',
  'isEventShown',
  'shownEnrolmentWhere',
  'feedbackParticipationWhere',
  'attendedShownBeforeWhere',
  'enrolledNotOverWhere',
] as const;

/**
 * What a talent and a parent read events through: every route of their spaces
 * and the remote functions declared beside them (the feedback form's
 * submission, `submitFeedback`, among them), and the services the talent's
 * home and parcours are built from. The dev workspace has its own gates
 * (`loadEventOr404`, `resolveWorkspaceEvents`) and its own guard.
 */
const familyReaders = [
  ...walk('src/routes/(talent)'),
  ...walk('src/routes/(parent)'),
  'src/lib/server/services/talentHomeHero.ts',
  'src/lib/server/services/workshopService.ts',
  'src/lib/server/talent/parcours.ts',
].filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

/**
 * The reads that name no event to anybody, each with why. Anything else read
 * here reaches a talent or a parent.
 */
const NAMES_NO_EVENT: Record<string, string> = {
  // A count sent to analytics, never displayed.
  'src/routes/(talent)/settings/+page.server.ts':
    'participation count for analytics',
  // The campus whose contact the thank-you page gives, off the latest enrolment.
  'src/routes/(parent)/parent/merci/+page.server.ts':
    'campus of the latest enrolment',
};

/**
 * Before #516 each talent and parent screen read the whole Salesforce history
 * and every one of them showed campaigns nobody had prepared, most under their
 * raw Salesforce title. The rule is one fragment a read has to remember, the
 * shape `sfMemberStatus.test.ts` already guards for the dev roster.
 */
describe('every talent and parent read shows only activated events', () => {
  it('finds a read that drops the rule', () => {
    const doctored = `prisma.participation.findMany({ where: { talentId } });
      prisma.participation.findMany({ where: { talentId, ...shownEnrolmentWhere() } });
      prisma.event.findFirst({ where: { id } });
      _count: { select: { participations: { where: shownEnrolmentWhere() } } }
      _count: { select: { participations: true } }
      prisma.participation.findMany({ where: { talentId, ...shownEnrolmentWhere() } });`;
    expect(readsWithout(doctored, EVENT_READ, SHOWN_MARKERS)).toHaveLength(3);
  });

  it('walks both spaces', () => {
    expect(familyReaders).toContain(
      'src/routes/(talent)/calendar/+page.server.ts',
    );
    expect(familyReaders).toContain(
      'src/routes/(parent)/parent/+page.server.ts',
    );
  });

  it('reads events through the rule, or names none', () => {
    const offenders = familyReaders.flatMap((file) => {
      if (file in NAMES_NO_EVENT) return [];
      const missing = readsWithout(
        readFileSync(file, 'utf-8'),
        EVENT_READ,
        SHOWN_MARKERS,
      );
      return missing.length === 0
        ? []
        : [`${file}: ${missing.length} read(s) without the rule`];
    });
    expect(offenders).toEqual([]);
  });
});
