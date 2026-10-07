/**
 * The world the E2E suite drives, and nothing more.
 *
 * Deliberately NOT the seed generator (`scripts/seed/`): that builds a dataset
 * shaped like production, and a spec anchored to it breaks the next time
 * somebody adjusts a scenario. This seeds the seven accounts and the two events
 * the specs actually assert on. Who those accounts are is declared in
 * `./identities.ts`, which the config and the specs share.
 *
 * Re-running is a full purge and rebuild rather than an upsert: the suite must
 * start from a known state whatever the last run left behind, including a run
 * that died halfway through the mutating spec.
 */
import { prisma } from './db';
import { E2E, E2E_DOMAIN } from './identities';
// The real domain helpers, imported across the tree rather than restated here.
// All are pure (no `$lib` import, no Prisma), so they resolve fine outside Vite,
// and a fixture that re-derived the school-year cutover would be a second copy of
// the rule the guard reads.
import { currentSchoolYearLabel } from '../../../src/lib/domain/schoolYear';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import {
  dateKeyToDbDate,
  toDateKey,
} from '../../../src/lib/domain/eventPresence';
import { fromWallClock } from '../../../src/lib/domain/planningTime';

/** The campus this fixture writes, and the clock its event is read on. */
const CAMPUS_TIMEZONE = 'Europe/Paris';

/**
 * Today ON THE CAMPUS CLOCK, stored the way production stores it: the day at
 * midnight UTC (what Salesforce sends) and the end at 23:59 campus time (what
 * the configuration screen writes). Every reader of an event's day reads the
 * campus clock, so a fixture built off the UTC date read « hier » for the last
 * one or two hours of every Paris evening, which is when somebody runs `verify`
 * after work.
 *
 * The émargement page lands on today's half-day (`defaultActiveSlotKey`), and
 * the dashboard leads with today's activity, so an event spanning today is what
 * makes both deterministic without the spec having to navigate anything.
 */
function campusToday(): { date: Date; endDate: Date } {
  const key = toDateKey(new Date(), CAMPUS_TIMEZONE);
  return {
    date: dateKeyToDbDate(key),
    endDate: fromWallClock(key, '23:59', CAMPUS_TIMEZONE),
  };
}

/** Drop everything this fixture owns. Safe to run against a dirty database. */
export async function purgeE2eData(): Promise<void> {
  // The event first: EventConfig_Module, Participation, EventPresence and the
  // closures all cascade off it.
  await prisma.event.deleteMany({
    where: { id: { in: [E2E.eventId, E2E.upcomingEventId] } },
  });
  // Then the talents. Talent -> bauth_user is SetNull, not Cascade, so deleting
  // the accounts first would leave orphan Talent rows behind (the same order the
  // load-test cleanup documents).
  await prisma.talent.deleteMany({
    where: { user: { email: { endsWith: E2E_DOMAIN } } },
  });
  await prisma.bauth_user.deleteMany({
    where: { email: { endsWith: E2E_DOMAIN } },
  });
  // The instance last: the link and the participation both Restrict onto it, so
  // it cannot go before the event (which cascades the link) and the talents
  // (which cascade the participation).
  await prisma.workshop_Instance.deleteMany({
    where: { id: E2E.workshopInstanceId },
  });
  await prisma.campus.deleteMany({ where: { id: E2E.campusId } });
}

export async function seedE2eData(): Promise<void> {
  await purgeE2eData();

  const now = new Date();
  const schoolYear = currentSchoolYearLabel();

  await prisma.campus.create({
    data: {
      id: E2E.campusId,
      name: 'E2E Campus',
      externalName: 'E2E_CAMPUS',
      timezone: CAMPUS_TIMEZONE,
      homeNote: {
        create: {
          markdown: `## Bienvenue\n\nRejoins [le Discord du campus](${E2E.homeNoteLink}).`,
        },
      },
      // A week out, so the highlight is still open whenever the suite runs.
      homeHighlight: {
        create: {
          title: E2E.homeHighlightTitle,
          summary: 'Deux heures pour coder ton propre Snake.',
          date: dateKeyToDbDate(
            toDateKey(new Date(Date.now() + 7 * 86_400_000), CAMPUS_TIMEZONE),
          ),
          url: E2E.homeHighlightUrl,
        },
      },
    },
  });

  // ── Staff ────────────────────────────────────────────────────────────────
  // The role lives on StaffProfile, not on bauth_user.role, and `campusId` is
  // not optional in practice: `getCampusId` throws without it, which is what
  // every campus-scoped dev page calls first.
  for (const [account, staffRole] of [
    [E2E.dev, 'dev'],
    [E2E.admin, 'admin'],
  ] as const) {
    await prisma.bauth_user.create({
      data: {
        id: account.userId,
        email: account.email,
        emailVerified: true,
        name: staffRole === 'admin' ? 'E2E Admin' : 'E2E Dev',
        role: 'staff',
        staffProfile: { create: { staffRole, campusId: E2E.campusId } },
      },
    });
  }

  // ── The curated activity the event offers ────────────────────────────────
  // A non-routable host, exactly as the generator seeds one: this fixture never
  // hands anybody over, it only needs the row the dashboard and the callback
  // are built from.
  await prisma.workshop_Instance.create({
    data: {
      id: E2E.workshopInstanceId,
      slug: E2E.workshopSlug,
      label: E2E.workshopLabel,
      baseUrl: 'https://e2e.ctfd.invalid',
    },
  });

  // ── Event, with the one module the mutating spec needs ───────────────────
  // `devActivatedAt` is the visibility gate and the module row is what
  // `requireEventModule` checks; either missing is a 404, not an empty screen.
  await prisma.event.create({
    data: {
      id: E2E.eventId,
      titre: 'E2E-Emargement',
      publicName: 'Émargement E2E',
      cohortNoun: 'participant',
      ...campusToday(),
      campusId: E2E.campusId,
      devActivatedAt: now,
      modules: { create: { moduleKey: EVENT_MODULES.EMARGEMENT } },
      // What the dev space shows, as the worker gives a new event: the READY
      // members below are on the roster because this row says so.
      shownStatuses: { create: [{ status: 'READY' }, { status: 'MET' }] },
      workshops: {
        create: {
          instanceId: E2E.workshopInstanceId,
          position: 0,
          durationMinutes: E2E.workshopDurationMinutes,
        },
      },
    },
  });

  // ── Talents ──────────────────────────────────────────────────────────────
  /** Every rung of the ladder, plus the charte and the welcome splash. */
  const dossierComplete = {
    infoValidatedAt: now,
    highSchoolValidatedAt: now,
    parentsValidatedAt: now,
    techInterestsValidatedAt: now,
    generalInterestsValidatedAt: now,
    interestsRecapSeenAt: now,
    equipmentValidatedAt: now,
    processingCompletedAt: now,
    rulesSignedAt: now,
  };

  await prisma.bauth_user.create({
    data: {
      id: E2E.talentReady.userId,
      email: E2E.talentReady.email,
      emailVerified: true,
      role: 'student',
      name: `${E2E.talentReady.prenom} ${E2E.talentReady.nom}`,
      talent: {
        create: {
          id: E2E.talentReady.talentId,
          nom: E2E.talentReady.nom,
          prenom: E2E.talentReady.prenom,
          niveau: 'Terminale',
          ...dossierComplete,
          charterAcceptedAt: now,
          welcomeSeenAt: now,
          // The year stamp is what makes the flat columns readable as THIS
          // year's dossier: `onboardingFieldsForYear` returns "nothing done"
          // without it, and the guard would send a signed talent back through
          // the wizard.
          onboardingSchoolYear: schoolYear,
          parentEmail: E2E.parentSettled.email,
          parentRulesSignedAt: now,
          imageRightsDecision: 'accepted',
          imageRightsDecidedAt: now,
          onboardingRecords: {
            create: {
              schoolYear,
              ...dossierComplete,
              parentRulesSignedAt: now,
              imageRightsDecision: 'accepted',
              imageRightsDecidedAt: now,
            },
          },
          participations: {
            create: {
              eventId: E2E.eventId,
              campusId: E2E.campusId,
              // A visible SF status: the émargement roster mirrors the inscrits
              // filter, so CONNECTED/DESISTED would seed an invisible talent.
              sfMemberStatus: 'READY',
            },
          },
        },
      },
    },
  });

  // Signed like the talent above, but enrolled only in a session three days
  // out: the home has no activity to lead with, so it leads with the campus's
  // highlight, and the session card has a date (and a confirmed hour) to give.
  await prisma.event.create({
    data: {
      id: E2E.upcomingEventId,
      titre: 'E2E-Prochain-Campagne-SF',
      publicName: E2E.upcomingEventName,
      cohortNoun: 'participant',
      date: dateKeyToDbDate(
        toDateKey(new Date(Date.now() + 3 * 86_400_000), CAMPUS_TIMEZONE),
      ),
      startMinutes: 14 * 60,
      campusId: E2E.campusId,
    },
  });
  await prisma.bauth_user.create({
    data: {
      id: E2E.talentIdle.userId,
      email: E2E.talentIdle.email,
      emailVerified: true,
      role: 'student',
      name: `${E2E.talentIdle.prenom} ${E2E.talentIdle.nom}`,
      talent: {
        create: {
          id: E2E.talentIdle.talentId,
          nom: E2E.talentIdle.nom,
          prenom: E2E.talentIdle.prenom,
          niveau: 'Terminale',
          ...dossierComplete,
          charterAcceptedAt: now,
          welcomeSeenAt: now,
          onboardingSchoolYear: schoolYear,
          // A guardian with no account: settled here, so the talent is not
          // held, and no parent session of this suite gains a second child.
          parentEmail: `parent-idle${E2E_DOMAIN}`,
          parentRulesSignedAt: now,
          imageRightsDecision: 'accepted',
          imageRightsDecidedAt: now,
          onboardingRecords: {
            create: {
              schoolYear,
              ...dossierComplete,
              parentRulesSignedAt: now,
              imageRightsDecision: 'accepted',
              imageRightsDecidedAt: now,
            },
          },
          participations: {
            create: {
              eventId: E2E.upcomingEventId,
              campusId: E2E.campusId,
              sfMemberStatus: 'READY',
            },
          },
        },
      },
    },
  });

  // Every rung but the signature, and no charte: the step then renders both of
  // the boxes it can render, which is what makes "exactly two" an assertion
  // rather than a coincidence. The year stamp and the dossier row matter for the
  // same reason they do above: without them the guard reads "nothing done" and
  // sends this talent back to step one instead of to the signature.
  const { rulesSignedAt: _signed, ...dossierBeforeRules } = dossierComplete;
  await prisma.bauth_user.create({
    data: {
      id: E2E.talentRules.userId,
      email: E2E.talentRules.email,
      emailVerified: true,
      role: 'student',
      name: `${E2E.talentRules.prenom} ${E2E.talentRules.nom}`,
      talent: {
        create: {
          id: E2E.talentRules.talentId,
          nom: E2E.talentRules.nom,
          prenom: E2E.talentRules.prenom,
          niveau: 'Seconde',
          ...dossierBeforeRules,
          welcomeSeenAt: now,
          onboardingSchoolYear: schoolYear,
          parentEmail: E2E.parentPending.email,
          onboardingRecords: {
            create: { schoolYear, ...dossierBeforeRules },
          },
        },
      },
    },
  });

  await prisma.bauth_user.create({
    data: {
      id: E2E.talentFresh.userId,
      email: E2E.talentFresh.email,
      emailVerified: true,
      role: 'student',
      name: `${E2E.talentFresh.prenom} ${E2E.talentFresh.nom}`,
      talent: {
        create: {
          id: E2E.talentFresh.talentId,
          nom: E2E.talentFresh.nom,
          prenom: E2E.talentFresh.prenom,
          niveau: 'Seconde',
          parentEmail: E2E.parentPending.email,
          participations: {
            create: {
              eventId: E2E.eventId,
              campusId: E2E.campusId,
              sfMemberStatus: 'READY',
            },
          },
        },
      },
    },
  });

  // ── Guardians ────────────────────────────────────────────────────────────
  // A guardian is "pending" while they still owe either act on any child
  // (`parentBlockedWhere`): the fresh talent above owes both, the ready one
  // owes neither. So the two accounts differ only by which child they point at,
  // which is exactly the rule the guard reads.
  for (const account of [E2E.parentPending, E2E.parentSettled]) {
    await prisma.bauth_user.create({
      data: {
        id: account.userId,
        email: account.email,
        emailVerified: true,
        role: 'parent',
        name: 'E2E Parent',
      },
    });
  }
}
