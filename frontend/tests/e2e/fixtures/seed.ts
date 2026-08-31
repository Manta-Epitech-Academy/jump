/**
 * The world the E2E suite drives, and nothing more.
 *
 * Deliberately NOT the seed generator (`scripts/seed/`): that builds a dataset
 * shaped like production, and a spec anchored to it breaks the next time
 * somebody adjusts a scenario. This seeds the six accounts and the one event
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
// Both are pure (no `$lib` import, no Prisma), so they resolve fine outside Vite,
// and a fixture that re-derived the school-year cutover would be a second copy of
// the rule the guard reads.
import { currentSchoolYearLabel } from '../../../src/lib/domain/schoolYear';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';

/**
 * Midnight UTC today. The émargement page lands on today's half-day
 * (`defaultActiveSlotKey`), so an event spanning today is what makes the roster
 * deterministic without the spec having to navigate créneaux. The half-day it
 * picks depends on the hour, which the spec does not care about: the per-talent
 * switch is gated on permission, never on the créneau's closure.
 */
function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Drop everything this fixture owns. Safe to run against a dirty database. */
export async function purgeE2eData(): Promise<void> {
  // The event first: EventConfig_Module, Participation, EventPresence and the
  // closures all cascade off it.
  await prisma.event.deleteMany({ where: { id: E2E.eventId } });
  // Then the talents. Talent -> bauth_user is SetNull, not Cascade, so deleting
  // the accounts first would leave orphan Talent rows behind (the same order the
  // load-test cleanup documents).
  await prisma.talent.deleteMany({
    where: { user: { email: { endsWith: E2E_DOMAIN } } },
  });
  await prisma.bauth_user.deleteMany({
    where: { email: { endsWith: E2E_DOMAIN } },
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
      timezone: 'Europe/Paris',
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

  // ── Event, with the one module the mutating spec needs ───────────────────
  // `devActivatedAt` is the visibility gate and the module row is what
  // `requireEventModule` checks; either missing is a 404, not an empty screen.
  await prisma.event.create({
    data: {
      id: E2E.eventId,
      titre: 'E2E-Emargement',
      publicName: 'Émargement E2E',
      cohortNoun: 'participant',
      date: todayUtcMidnight(),
      endDate: todayUtcMidnight(),
      campusId: E2E.campusId,
      devActivatedAt: now,
      modules: { create: { moduleKey: EVENT_MODULES.EMARGEMENT } },
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
