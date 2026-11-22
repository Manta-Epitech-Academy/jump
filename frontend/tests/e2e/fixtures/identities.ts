/**
 * Who the E2E suite is, and where each identity's session is stored.
 *
 * Prisma-free on purpose: `playwright.config.ts` and every spec import this, and
 * pulling a database client into config resolution would make even
 * `playwright --list` open a connection. The seeding that USES this table lives
 * in `./seed.ts`.
 *
 * Every id is a literal. `@default(cuid())` is only a default, so a fixture can
 * name its own rows: the specs then address them directly
 * (`/staff/dev/events/${E2E.eventId}/emargement`) with no context file to write
 * and no lookup to do, and the teardown is exactly scoped.
 *
 * Every account lives under `@e2e.invalid`, the same trick the load-test pool
 * uses with `@loadtest.invalid`: it cannot collide with a real address, and it
 * makes the purge a single predicate.
 */
import path from 'node:path';

export const E2E_DOMAIN = '@e2e.invalid';

export const E2E = {
  campusId: 'e2e-campus',
  eventId: 'e2e-event-emargement',
  /** The one curated activity, offered by the event above, and its host. */
  workshopInstanceId: 'e2e-workshop-instance',
  workshopInstanceSlug: 'e2e-instance',
  workshopActivityId: 'e2e-workshop-activity',
  workshopSlug: 'e2e-atelier',
  workshopLabel: 'Atelier E2E',
  /**
   * A second activity on the same host, offered by the same event, so the
   * day's hero has a choice to lay out rather than a single subject.
   */
  secondWorkshopActivityId: 'e2e-workshop-activity-2',
  secondWorkshopSlug: 'e2e-atelier-2',
  secondWorkshopLabel: 'Second atelier E2E',
  /** What the campus puts on its talents' home: its note and its event. */
  homeNoteLink: 'https://discord.invalid/e2e',
  /** The camp the campus points at, still to come, and its sign-up form. */
  highlightedEventId: 'e2e-event-highlighted',
  highlightedEventName: 'Camp E2E',
  highlightedSignupUrl:
    'https://www.epitech.invalid/inscription-camp/?CampaignId=e2e',
  /** An event weeks ago on that campus, the only one of `talentInvited`. */
  pastEventId: 'e2e-event-past',
  /**
   * A second campus that only invites « toute l'année », with no event to
   * point at, and the event weeks ago that makes `talentGeneric` one of its own.
   */
  genericCampusId: 'e2e-campus-generic',
  genericPastEventId: 'e2e-event-past-generic',
  homeInvitationTitle: 'Recode le jeu Snake en JS',
  homeInvitationUrl: 'https://www.epitech.invalid/inscription/?CampaignId=e2e',
  /**
   * An event on 31 July of a past school year, shown in the dev space: the
   * calendar has a year other than today's to come back to, and the one day
   * where the event's school year is not the calendar that lists it.
   */
  pastJulyEventId: 'e2e-event-past-july',
  pastJulyEventName: 'Fin juillet E2E',
  pastJulyEventDay: '2025-07-31',
  /** The calendar listing it: the July closing 2024-2025, not 2025-2026. */
  pastJulyCalendarYear: '2024-2025',
  /** A session three days out, the only event of `talentIdle`. */
  upcomingEventId: 'e2e-event-upcoming',
  upcomingEventName: 'Coding Club E2E',
  /**
   * A published feedback form with one free-text question, open to a signed-in
   * talent. No event names it: the page and its command read the form by slug
   * and the participation by event, so `talentReady` reaches it on `eventId`.
   */
  feedbackFormId: 'e2e-feedback-form',
  feedbackFormSlug: 'e2e-feedback',

  /**
   * An event whose only section is Inscrits, ten days out, with three talents
   * who differ on exactly what the roster filters on (niveau, civilité). Its
   * own event so the émargement one keeps landing on émargement, and its
   * talents have no account: nobody logs in as them.
   */
  rosterEventId: 'e2e-event-inscrits',
  rosterTalents: [
    {
      id: 'e2e-talent-roster-1',
      nom: 'ROSTERUN',
      prenom: 'Inès',
      civilite: 'femme',
      niveau: 'Seconde',
    },
    {
      id: 'e2e-talent-roster-2',
      nom: 'ROSTERDEUX',
      prenom: 'Hugo',
      civilite: 'homme',
      niveau: 'Seconde',
    },
    {
      id: 'e2e-talent-roster-3',
      nom: 'ROSTERTROIS',
      prenom: 'Lina',
      civilite: 'femme',
      niveau: 'Première',
    },
  ],

  /** Dev-workspace member: `can('devMember')`, campus-scoped. */
  dev: { userId: 'e2e-user-dev', email: `dev${E2E_DOMAIN}` },
  /** Admin: the other staff space, used to assert the cross-space bounce. */
  admin: { userId: 'e2e-user-admin', email: `admin${E2E_DOMAIN}` },

  /** Onboarding finished for the year in progress: walks straight in. */
  talentReady: {
    userId: 'e2e-user-talent-ready',
    talentId: 'e2e-talent-ready',
    email: `talent-ready${E2E_DOMAIN}`,
    nom: 'READYTEST',
    prenom: 'Alix',
  },
  /**
   * Onboarded like `talentReady`, but whose only event is three days out: no
   * subject today, so the home's hero says they are expected, and when.
   */
  talentIdle: {
    userId: 'e2e-user-talent-idle',
    talentId: 'e2e-talent-idle',
    email: `talent-idle${E2E_DOMAIN}`,
    nom: 'IDLETEST',
    prenom: 'Noa',
  },
  /**
   * Onboarded, came to an event weeks ago, enrolled in nothing to come: the
   * hero invites them to the event their campus points at.
   */
  talentInvited: {
    userId: 'e2e-user-talent-invited',
    talentId: 'e2e-talent-invited',
    email: `talent-invited${E2E_DOMAIN}`,
    nom: 'INVITEDTEST',
    prenom: 'Lou',
  },
  /** The same, on the campus that only invites « toute l'année ». */
  talentGeneric: {
    userId: 'e2e-user-talent-generic',
    talentId: 'e2e-talent-generic',
    email: `talent-generic${E2E_DOMAIN}`,
    nom: 'GENERICTEST',
    prenom: 'Eden',
  },
  /** Nothing signed: belongs in the welcome / onboarding funnel. */
  talentFresh: {
    userId: 'e2e-user-talent-fresh',
    talentId: 'e2e-talent-fresh',
    email: `talent-fresh${E2E_DOMAIN}`,
    nom: 'FRESHTEST',
    prenom: 'Camille',
  },
  /**
   * Every rung walked except the last: lands straight on the signature step.
   * `talentFresh` cannot stand in, because reaching that step from nothing means
   * walking six forms, and what the spec asserts is what the step ASKS.
   */
  talentRules: {
    userId: 'e2e-user-talent-rules',
    talentId: 'e2e-talent-rules',
    email: `talent-rules${E2E_DOMAIN}`,
    nom: 'RULESTEST',
    prenom: 'Sasha',
  },

  /** Guardian who still owes an act on their child: held inside the flow. */
  parentPending: {
    userId: 'e2e-user-parent-pending',
    email: `parent-pending${E2E_DOMAIN}`,
  },
  /** Guardian who owes nothing: lands on the thank-you page. */
  parentSettled: {
    userId: 'e2e-user-parent-settled',
    email: `parent-settled${E2E_DOMAIN}`,
  },
} as const;

/** Every account the fixture owns, which is every session `auth.setup.ts` mints. */
export const E2E_ACCOUNTS = [
  E2E.dev,
  E2E.admin,
  E2E.talentReady,
  E2E.talentIdle,
  E2E.talentInvited,
  E2E.talentGeneric,
  E2E.talentFresh,
  E2E.talentRules,
  E2E.parentPending,
  E2E.parentSettled,
] as const;

const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth');

/** `dev@e2e.invalid` -> `<...>/tests/e2e/.auth/dev.json` */
export function storageStatePath(email: string): string {
  return path.join(AUTH_DIR, `${email.split('@')[0]}.json`);
}
