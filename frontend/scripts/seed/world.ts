/**
 * The world being built.
 *
 * Scenarios describe situations ("a stage in Lyon with 200 enrolments, ten days
 * of émargement and forty closings"); this holds the state that makes such a
 * sentence executable, and hands back references so one scenario can build on
 * another's rows without a database round trip.
 *
 * It is the only place that knows row shapes. A scenario that reaches past it
 * into `buffer` is doing something the world should have been taught instead.
 */

import type {
  ImageRightsDecision,
  Prisma,
  PresenceSlot,
  PresenceSource,
  PresenceStatus,
  StaffRole,
  XpGrantSource,
} from '@prisma/client';
import type { SeedContext } from './context';
import { createBuffer, type Buffered } from './writer';
import { id, seq, slug } from './ids';
import { SEED_MAIL_DOMAIN, STAFF_MAIL_DOMAIN } from './catalog/people';
import type { CampusSpec } from './catalog/campuses';
import type { SchoolSpec } from './catalog/schools';
import type { SlotBlueprint } from './catalog/planning';
import type { Rng } from './rng';
import type { SfMemberStatus } from '../../src/lib/domain/sfMemberStatus';
import { activationBlockers } from '../../src/lib/domain/eventReadiness';
import {
  minigameRankBonus,
  minigameRankBonusLimit,
} from '../../src/lib/domain/xp';
import { fromWallClock } from '../../src/lib/domain/planningTime';
import {
  CIVILITE_OPTIONS,
  PARENT_TYPE_OPTIONS,
} from '../../src/lib/domain/profile';
import { INTEREST_COUNTS } from '../../src/lib/validation/onboarding';

/**
 * What a guardian is called. One first name for all of them, paired with the
 * child's surname, matching the signature blocks `addDossier` already writes:
 * a document signed « Responsable <Nom> » and a contact card naming somebody
 * else would be two people.
 */
const GUARDIAN_PRENOM = 'Responsable';
const GUARDIAN_PHONE = '+33700000000';

export type CampusRef = {
  id: string;
  name: string;
  timezone: string;
  /** Relative share of the platform's enrolments, from PROFILE.md. */
  weight: number;
};
/**
 * How much a staff member comes, as the four states the platform actually
 * counts: `ops_staff_activity` buckets a roster into active in the last seven
 * days, inactive for thirty, and never opened, and the members page adds « rien
 * sur la fenêtre » for somebody whose last visit predates the usage retention.
 * A roster where everybody is equally active leaves three of the four empty.
 */
export type StaffActivity = 'active' | 'occasional' | 'lapsed' | 'never';

/**
 * One day a member opened one space.
 *
 * The fact everything else about their activity is derived from: the feature
 * rows, the connection row, and `StaffProfile.lastActiveAt`. Generated here
 * rather than in the usage factory because it describes the PERSON, and because
 * two generators writing what one person did is exactly how the dataset ended
 * up claiming a member had four months of feature use and two connections on
 * unrelated days.
 *
 * A day and a space, and nothing else. It also carried the login it belonged to
 * and whether it opened one, because a connection row was one per BetterAuth
 * session; a connection is now one per space per day, so the visit IS the row
 * and there is nothing left to group.
 */
export type StaffVisit = {
  /** Days before the anchor, negative. */
  readonly dayOffset: number;
  readonly space: 'dev' | 'admin';
};

/**
 * How far back each tier that HAS visits reaches, and how densely.
 *
 * The tiers are spans, not a distribution: `active` has to reach into the last
 * seven days and `occasional` has to stay out of the last thirty, because those
 * are the two thresholds `ops_staff_activity` cuts on.
 *
 * `mostRecent` is therefore a floor on the whole history and not only on the
 * one visit that is placed. `lastActiveAt` is the MAXIMUM of the set, so a
 * placed anchor drawn from a narrow range and every other day drawn from
 * [1, oldest] leaves the tier decided by the widest draw: measured on the real
 * generator, 61% of `occasional` landed inside thirty days and 17% inside
 * seven, which is the `active` bucket. One floor per tier is what makes the
 * span hold by construction.
 *
 * `never` and `lapsed` are absent because they have no visits at all: `never`
 * was invited and did not come, and `lapsed` last came beyond the usage
 * retention, which is the state whose dialog says « 0 jour d'activité sur les
 * 12 derniers mois » while the two dates above it are still set - precisely why
 * those dates do not come from the usage rows.
 */
const VISIT_SPANS: Readonly<
  Record<
    Extract<StaffActivity, 'active' | 'occasional'>,
    {
      /** How many distinct days, inclusive. */
      readonly count: readonly [number, number];
      /** The freshest day, inclusive, in days before the anchor. */
      readonly mostRecent: readonly [number, number];
      /** The furthest back any visit of this tier goes. */
      readonly oldest: number;
    }
  >
> = {
  active: { count: [40, 90], mostRecent: [1, 4], oldest: 330 },
  occasional: { count: [6, 15], mostRecent: [35, 80], oldest: 300 },
};

export type StaffRef = {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  campusId: string | null;
  /** Empty for a member who has never opened their account, or no longer does. */
  readonly visits: readonly StaffVisit[];
};
export type TalentRef = {
  id: string;
  userId: string | null;
  email: string;
  prenom: string;
  nom: string;
  niveau: string | null;
  campusId: string | null;
  parentEmail: string | null;
};
export type BankQuestion = {
  id: string;
  key: string;
  kind: 'single' | 'multi' | 'rating' | 'text';
  max: number | null;
  optionIds: string[];
};

export type FeedbackFormRef = {
  id: string;
  slug: string;
  questions: { id: string; type: string; optionIds: string[] }[];
};

/**
 * One day's published game.
 *
 * `scoringType` and `publishedAt` travel with the id because both are needed to
 * play it and neither can be re-derived: the scoring decides which direction a
 * result ranks in, and the publication date IS the day the run happened, a
 * « jeu du jour » being played on its own day.
 */
export type MinigamePublicationRef = {
  id: string;
  game: string;
  scoringType: 'chrono' | 'score';
  publishedAt: Date;
};

export type EventRef = {
  id: string;
  titre: string;
  /** Admin-set name, if any. Carried so a caller can resolve the same
   * display name `eventDisplayName` (`src/lib/domain/event.ts`) resolves for a
   * human, instead of a manifest quoting the internal `titre` a screen never
   * shows. */
  publicName: string | null;
  campusId: string;
  campusName: string;
  date: Date;
  endDate: Date | null;
  /** Weekdays the event actually runs, for émargement and planning. */
  days: Date[];
  /**
   * The closing grid this event conducts against, or null when it conducts
   * none. Carried so a scenario can ask « does this event run closings »
   * without re-deriving it from the module list: a returning talent is worth
   * more on an event that does, because a multi-closing parcours is the whole
   * reason the returning pool exists.
   */
  closingTemplateId: string | null;
};

/**
 * The Salesforce member status a participation gets when nobody says otherwise.
 *
 * Only VISIBLE statuses are ever drawn, and that is what keeps every cohort on
 * the size PROFILE.md measured. Production's enrolments were counted when the
 * column was null on every row, so the measured distribution (median 23) is a
 * distribution of the rows a screen SHOWS. Draw a hidden status here and every
 * cohort quietly falls below its own target, and two manifest lines that promise
 * "200 inscrits" stop being true. `CONNECTED`, `DESISTED` and the legacy `null`
 * are therefore PLACED, in fixed numbers, by the `statuts-salesforce` scenario.
 *
 * The two weights are PROFILE.md's presence figures rather than new numbers:
 * `pastEventPresence` maps MEET to present and READY to absent, so the share of
 * each is the share of présents and absents. Left as 81 and 16 instead of a
 * normalised 83.5 / 16.5 so the provenance stays readable; `weighted` does not
 * need them to sum to 100.
 */
const STARTED_EVENT_SF_MIX = [
  ['MEET', 81],
  ['READY', 16],
] as const satisfies readonly (readonly [SfMemberStatus, number])[];

/**
 * An event that has not happened yet: nobody attended it, so `MEET` is not a
 * state the world can be in. One weighted entry rather than an early return, so
 * a derived enrolment always consumes exactly one draw - otherwise moving an
 * event from the past to the future desynchronises every status after it.
 */
const UPCOMING_EVENT_SF_MIX = [
  ['READY', 100],
] as const satisfies readonly (readonly [SfMemberStatus, number])[];

/** Shared empty set, so `playedBy` allocates nothing on the common answer. */
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/**
 * How many events a talent attends over their whole time on the platform.
 *
 * PROFILE.md's own histogram, as percentages of the 5 313 talents who carry at
 * least one enrolment: 3 665 came once, 1 243 twice, 276 three times, and a
 * queue out to eleven. Its mean is 1.438, which is production's own ratio of
 * 7 638 enrolments to 5 313 enrolled talents - so a generator that honours this
 * draw lands on both figures at once instead of matching one and missing the
 * other.
 *
 * It lives here, beside the Salesforce mix and not in `scenarios/helpers.ts`
 * with the rest of the distributions, for the reason that file's own header
 * gives: a distribution lives beside the code that draws it, and this one is
 * drawn by `addTalent`. `world.ts` imports nothing from `scenarios/`.
 *
 * Drawn ONCE, at the talent's creation, rather than applied as a per-cohort
 * reuse rate. A reuse rate produces a geometric tail, and the measured shape is
 * not geometric: it is fatter at two and thinner from three on. Drawing the
 * whole career from the histogram reproduces the histogram.
 *
 * It is a CAP on what the returning pool will offer (see `returningPool`), not
 * a quota the generator has to spend. A talent whose career is never drawn on
 * simply came once, which is what two thirds of them do.
 *
 * **The tail of it is placed, not drawn**, and `placeCareer` is how. Ten and
 * eleven are 0.06% of this histogram, which is two or three talents at staging
 * and none at all at `ci`, so a recurring format asking the draw for regulars
 * asks for somebody the draw almost never produces - see `placeCareer` for what
 * a scenario does instead.
 */
const CAREER_MIX = [
  [1, 69.0],
  [2, 23.4],
  [3, 5.19],
  [4, 1.32],
  [5, 0.53],
  [6, 0.13],
  [7, 0.15],
  [8, 0.15],
  [9, 0.09],
  [10, 0.02],
  [11, 0.04],
] as const satisfies readonly (readonly [number, number])[];

export class World {
  readonly buffer: Buffered = createBuffer();
  readonly campuses = new Map<string, CampusRef>();
  /**
   * Campus names a flagship scenario (stage, club) has already claimed via
   * `pickCampus`. `pickWeightedCampus` never has to consult it - the whole
   * platform's weighted volume can land anywhere - but it is what keeps a
   * later deliberately-placed state (a campus with zero conducted closings,
   * say) from landing on Lyon or Nice by accident and reading as configured
   * noise instead of the state it is meant to be.
   */
  readonly reservedCampusNames = new Set<string>();
  readonly schools = new Map<string, string>();
  readonly staff: StaffRef[] = [];
  readonly talents: TalentRef[] = [];
  readonly events: EventRef[] = [];
  /**
   * Events a scenario has placed a cohort or a state on. The event twin of
   * `reservedCampusNames`, and it exists for the same reason: a later scenario
   * that wants « an event on this campus » must not silently land on one whose
   * figures are the point.
   *
   * It became load-bearing when the stage de seconde went national. `stage`
   * runs second, so its event is the FIRST one on every campus, and both
   * `edgeTalents` and `operations` were taking the first: forty talents in rare
   * dossier states were enrolled onto a stage cohort whose size is the whole
   * reason it exists, and the campaign broadcasts went out to it. Nothing said
   * so - the roster was simply 59 where the scenario had built 18.
   */
  readonly reservedEventIds = new Set<string>();
  /** Enrolments, so a scenario can mark presence without re-deriving the roster. */
  readonly roster = new Map<string, TalentRef[]>();

  /**
   * The closing question bank, read from the database before any scenario runs.
   *
   * It is not created here: a migration carries it, and re-creating it would
   * mean the seed owned a catalogue the team authors over the API. Scenarios
   * therefore compose against whatever the bank currently holds, which is also
   * what keeps them working the day a question is added to it.
   */
  readonly bank = new Map<string, BankQuestion>();

  /** Feedback forms, read from the database after the catalogue writes them. */
  readonly feedbackForms = new Map<string, FeedbackFormRef>();

  /**
   * The interest catalogue, read back after the catalogue seeder writes it.
   *
   * Split by `kind` because the wizard asks the two questions separately and
   * bounds them separately, and a talent holding three tech interests is a row
   * the application could not have produced.
   */
  readonly interests: { tech: string[]; general: string[] } = {
    tech: [],
    general: [],
  };

  /** Broadcast templates, written by the catalogue and read back by the runner. */
  readonly broadcastTemplates: { id: string; channel: 'mail' | 'sms' }[] = [];

  /**
   * The minigame rotation, written by `platform` and played by `minijeux`.
   * Held here rather than passed between the two for the same reason the
   * broadcast templates are: the scenario list is a run order, not a call
   * graph, and a scenario reads what an earlier one left behind.
   */
  readonly minigamePublications: MinigamePublicationRef[] = [];

  /** The stage grid the migration carries, resolved by the runner. */
  stageTemplateId: string | null = null;
  /** The certificate the migration carries, resolved by the runner. */
  diplomaTemplateId: string | null = null;

  private talentCounter = 0;
  private readonly talentsWithInterests = new Set<string>();
  /**
   * How many events each talent will attend in all, drawn from `CAREER_MIX`
   * when they are created. Generator bookkeeping and not a column, so it stays
   * off `TalentRef`: nothing the writer flushes reads it.
   */
  private readonly careerByTalent = new Map<string, number>();
  /**
   * Talents by id. `talents` is the ordered list scenarios sample from; this is
   * the lookup the minigame ranking pass needs, which visits every finished
   * attempt and has to reach its player to grant the bonus.
   */
  private readonly talentById = new Map<string, TalentRef>();
  /**
   * Which events each talent is enrolled on. The inverse of `roster`, kept
   * because `returningPool` asks the question from the talent's side and
   * scanning every roster to answer it is quadratic on a staging cohort.
   */
  private readonly enrolledEventsByTalent = new Map<string, Set<string>>();
  /** Which publications each talent has played. See `notePlayed`. */
  private readonly playedByTalent = new Map<string, Set<string>>();
  /** Which school years each talent has filed a dossier for. See `noteDossier`. */
  private readonly dossierYears = new Map<string, Set<string>>();
  /** Guardian addresses already minted a `bauth_user`, so a returning dossier
   * and the second-guardian scenario calling `setGuardian` on the same talent
   * never push a second row and collide on `bauth_user.email`'s unique index. */
  private readonly guardianAccounts = new Set<string>();
  private xpByTalent = new Map<string, number>();
  private presentEventsByTalent = new Map<string, Set<string>>();
  /**
   * Its own stream, so adding this draw does not shift the numbers every other
   * scenario gets. Assigned in the constructor BODY and not as a field
   * initialiser: this directory targets ES2022 without `useDefineForClassFields`,
   * so field initialisers run before the parameter property `ctx` is assigned and
   * would read it as undefined. Stored rather than forked per call, since forking
   * on every `enrol` rebuilds the same generator and hands every participation
   * the same status.
   */
  private readonly sfRng: Rng;
  /**
   * The stream every optional answer the wizard collects is drawn from, for the
   * same reason `sfRng` is one: adding a draw here must not shift the numbers
   * every scenario gets. Readable by `factories/onboarding.ts`, which walks the
   * same steps; scenarios draw from `ctx.rng`.
   */
  readonly wizardRng: Rng;

  /**
   * The stream a member's visit history is drawn from. Forked for the same
   * reason as the two above: `addStaff` runs in the first scenario, so drawing
   * from the shared stream here would renumber the entire dataset.
   */
  private readonly staffRng: Rng;

  /**
   * The stream a talent's career length is drawn from, and the one place the
   * fork matters most: `addTalent` runs for every talent in the dataset, so
   * drawing a career from the shared stream would shift every subsequent draw
   * and move every deliberately placed state in the world.
   */
  private readonly careerRng: Rng;

  constructor(readonly ctx: SeedContext) {
    this.sfRng = ctx.rng.fork('sfMemberStatus');
    this.wizardRng = ctx.rng.fork('wizard');
    this.staffRng = ctx.rng.fork('staffActivity');
    this.careerRng = ctx.rng.fork('career');
  }

  /** Monotonic, so ids stay unique however scenarios are ordered. */
  nextTalentIndex(): number {
    this.talentCounter += 1;
    return this.talentCounter;
  }

  // ─── Campus and school ────────────────────────────────────────────────────

  addCampus(spec: CampusSpec): CampusRef {
    const ref: CampusRef = {
      id: id('cmp', spec.name),
      name: spec.name,
      timezone: spec.timezone,
      weight: spec.weight,
    };
    this.buffer.campus.push({
      id: ref.id,
      name: spec.name,
      // No external name, and that IS the worker isolation: `/api/worker/config`
      // serves a `Sync_Source` only when its campus carries one, so a seeded
      // database is outside every sync's scope by construction. Give one of
      // these a real external name and real minors' data starts landing on it.
      externalName: null,
      timezone: spec.timezone,
      contactEmail:
        spec.withContactEmail === false
          ? null
          : `${slug(spec.name)}@${STAFF_MAIL_DOMAIN}`,
    });
    this.campuses.set(spec.name, ref);
    return ref;
  }

  /** The buffered row for a talent, so a factory can write its projection. */
  talentRow(talentId: string): Prisma.TalentCreateManyInput {
    const row = this.buffer.talent.find(
      (candidate) => candidate.id === talentId,
    );
    if (!row) throw new Error(`No buffered talent ${talentId}.`);
    return row;
  }

  campus(name: string): CampusRef {
    const found = this.campuses.get(name);
    if (!found) throw new Error(`No campus "${name}" in this profile.`);
    return found;
  }

  /**
   * A named campus for a flagship scenario, preferring `name` when it exists
   * and nobody has claimed it yet; otherwise the first unclaimed campus, or
   * the platform's first if every one already is. Claims the campus it
   * resolves to (see `reservedCampusNames`), so stage and club can each ask
   * for their own without a caller having to reason about the other's pick.
   */
  pickCampus(preferred: string): CampusRef {
    const all = [...this.campuses.values()];
    const free = all.filter((c) => !this.reservedCampusNames.has(c.name));
    const campus =
      this.campuses.has(preferred) && !this.reservedCampusNames.has(preferred)
        ? this.campus(preferred)
        : (free[0] ?? all[0])!;
    this.reservedCampusNames.add(campus.name);
    return campus;
  }

  /**
   * A campus drawn by its real enrolment share (PROFILE.md's `weight`), so a
   * distribution built from many draws reproduces the platform's own
   * Paris/Moulins-style skew instead of landing flat across every campus,
   * which is as false as a single one.
   */
  pickWeightedCampus(exclude?: ReadonlySet<string>): CampusRef {
    const pool = [...this.campuses.values()].filter(
      (c) => !exclude?.has(c.name),
    );
    const bag = (pool.length > 0 ? pool : [...this.campuses.values()]).map(
      (c) => [c, c.weight] as const,
    );
    return this.ctx.rng.weighted(bag);
  }

  addSchool(spec: SchoolSpec): string {
    const schoolId = id('sch', spec.uai);
    // The commune and `resolvedAt` travel together, because `enrichSchool`
    // writes them in one update: a row holding one and not the other is a state
    // the application has no path to. Written as one branch rather than four
    // fields so the pair cannot come apart here either.
    //
    // And `inseeCode` is not `postalCode`. The two are different numbers, and
    // copying one into the other wrote a value no annuaire ever returns (Nancy
    // is postal 54000, INSEE 54395), so anything joining on the commune read a
    // code that does not exist.
    const annuaire =
      spec.resolved === false
        ? { city: null, postalCode: null, inseeCode: null, resolvedAt: null }
        : {
            city: spec.city,
            postalCode: spec.postalCode,
            inseeCode: spec.inseeCode,
            resolvedAt: this.ctx.clock.days(-400),
          };
    this.buffer.school.push({
      id: schoolId,
      uai: spec.uai,
      name: spec.name,
      ...annuaire,
    });
    this.schools.set(spec.uai, schoolId);
    return schoolId;
  }

  // ─── Staff ────────────────────────────────────────────────────────────────

  /**
   * A member's visit history, and the two projections read off it. What each
   * tier means, and why its freshest day is a floor rather than one draw, is on
   * {@link VISIT_SPANS}.
   */
  private visitsFor(activity: StaffActivity, role: StaffRole): StaffVisit[] {
    if (activity === 'never' || activity === 'lapsed') return [];
    const rng = this.staffRng;
    const span = VISIT_SPANS[activity];
    const count = rng.int(...span.count);

    // The freshest day this tier may hold, and it bounds EVERY draw rather than
    // only the placed one. `lastActiveAt` is the most recent visit, so the
    // bucket the member lands in is decided by the maximum of the whole set:
    // placing the anchor at -35 and then filling from [-300, -1] left 61% of
    // `occasional` inside thirty days and 17% inside seven, which is the
    // `active` bucket. One floor for the tier makes the span structural instead
    // of a property of the first draw.
    //
    // At least yesterday, never today: `occurredAt` carries a wall-clock hour
    // and `assert/clock.ts` refuses a seeded timestamp past the anchor, which is
    // the anchor's own midnight.
    const [freshest, stalest] = span.mostRecent;
    const offsets = new Set<number>([-rng.int(freshest, stalest)]);
    while (offsets.size < count) offsets.add(-rng.int(freshest, span.oldest));
    const days = [...offsets].sort((a, b) => a - b);

    // An admin works in the admin space and drops into the dev one now and
    // again, which is the question `usageConnectionFeature` exists to keep
    // answerable: « les administrateurs ouvrent-ils jamais l'espace dev ».
    const home = role === 'admin' ? 'admin' : 'dev';
    const away = role === 'admin' ? 'dev' : 'admin';

    // The away space is a scattering of an admin's days, not a run of them. It
    // used to be a run because the space was picked per fortnight-long session,
    // a session being what a connection row counted. Nothing counts sessions
    // now, so the day is the only unit left and the choice belongs to the day.
    // Only an admin ever leaves their own space: a dev has no admin space to
    // open.
    return days.map((dayOffset, index) => ({
      dayOffset,
      space: role === 'admin' && index % 7 === 0 ? away : home,
    }));
  }

  addStaff(opts: {
    prenom: string;
    nom: string;
    role: StaffRole;
    campus: CampusRef | null;
    /**
     * How much this member comes. Defaults to `active`; the roster in
     * `platform.ts` spreads the four tiers across the team.
     */
    activity?: StaffActivity;
    /**
     * Whether this member has already run the three incremental exports. Each
     * one stores its own high-water mark, and every export is a full one until
     * a mark exists - so a roster where nobody had ever exported left all three
     * columns null and the incremental half of the feature unreachable.
     */
    hasExported?: boolean;
  }): StaffRef {
    const email = `${slug(opts.prenom)}.${slug(opts.nom)}@${STAFF_MAIL_DOMAIN}`;
    const userId = id('usr', 'staff', opts.prenom, opts.nom);
    const profileId = id('stf', opts.prenom, opts.nom);
    const name = `${opts.prenom} ${opts.nom}`;
    const activity = opts.activity ?? 'active';
    const visits = this.visitsFor(activity, opts.role);

    this.buffer.bauth_user.push({
      id: userId,
      email,
      name,
      emailVerified: true,
      role: opts.role === 'admin' ? 'admin' : 'staff',
      createdAt: this.ctx.clock.days(-500),
    });
    this.buffer.staffProfile.push({
      id: profileId,
      userId,
      campusId: opts.role === 'admin' ? null : (opts.campus?.id ?? null),
      staffRole: opts.role,
      // `firstLoginAt` is deliberately NOT derived from the visits: it reaches
      // back further than the usage retention, which is what makes « invité,
      // jamais ouvert » answerable at all and what the members dialog says in
      // as many words. `lastActiveAt` IS derived, because it is the same fact
      // as the last visit and two independent writes of one fact is the defect
      // this whole change removes: the roster used to read « actif il y a 2
      // jours » for every member, including the ones with no usage row at all.
      firstLoginAt: activity === 'never' ? null : this.ctx.clock.days(-480),
      lastActiveAt:
        activity === 'never'
          ? null
          : activity === 'lapsed'
            ? this.ctx.clock.days(-430)
            : this.ctx.clock.days(visits[visits.length - 1]?.dayOffset ?? -430),
      sfExportedAt: opts.hasExported ? this.ctx.clock.days(-7) : null,
      onboardingDocsExportedAt: opts.hasExported
        ? this.ctx.clock.days(-21)
        : null,
      closingDocsExportedAt: opts.hasExported ? this.ctx.clock.days(-14) : null,
    });

    const ref: StaffRef = {
      id: profileId,
      userId,
      email,
      name,
      role: opts.role,
      campusId: opts.campus?.id ?? null,
      visits,
    };
    this.staff.push(ref);
    return ref;
  }

  staffFor(campusId: string): StaffRef[] {
    return this.staff.filter((member) => member.campusId === campusId);
  }

  /** Declares that this event's cohort is placed, not incidental. */
  reserveEvent(event: EventRef): void {
    this.reservedEventIds.add(event.id);
  }

  /**
   * An ordinary event on this campus: one no scenario has reserved.
   *
   * Falls back to a reserved one, and then to any event at all, because a
   * profile small enough to have none unreserved still has to produce a
   * dataset. Same degradation as `pickCampus`.
   */
  pickOrdinaryEvent(campusId: string): EventRef {
    const onCampus = this.events.filter((event) => event.campusId === campusId);
    const free = onCampus.filter(
      (event) => !this.reservedEventIds.has(event.id),
    );
    const picked = free[0] ?? onCampus[0] ?? this.events[0];
    if (!picked)
      throw new Error(
        'Aucun événement n’a été créé avant le scénario qui en demande un.',
      );
    return picked;
  }

  // ─── Talents ──────────────────────────────────────────────────────────────

  /**
   * Creates the account half of a talent, which is the part that decides whether
   * anybody can actually sign in as them.
   *
   * The app mints a talent's login from `TalentSfImport.sfEmail` and refuses when
   * the two disagree, so the mirror's address and the `bauth_user` address are
   * written from one value here rather than passed separately. It is the kind of
   * mismatch a seed produces silently and a person only discovers at the login
   * screen.
   */
  addTalent(opts: {
    prenom: string;
    nom: string;
    niveau: string | null;
    campus: CampusRef | null;
    index: number;
    withAccount?: boolean;
    externalId?: string | null;
    phone?: string | null;
    schoolId?: string | null;
    highSchoolNameManual?: string | null;
    /**
     * How many events this talent will attend in all, when it is placed rather
     * than drawn from `CAREER_MIX`. An explicit career consumes no draw, so
     * placing one has no effect on any other talent in the dataset - the same
     * property `enrol`'s explicit status has, and for the same reason.
     */
    career?: number;
    /** What Salesforce claims, when it differs from what the talent confirmed. */
    sfClaims?: {
      nom?: string;
      prenom?: string;
      phone?: string;
      niveau?: string;
    };
  }): TalentRef {
    const talentId = id('tal', seq(opts.index, 5));
    const email = `${slug(opts.prenom)}.${slug(opts.nom)}.${seq(opts.index, 5)}@${SEED_MAIL_DOMAIN}`;
    const withAccount = opts.withAccount ?? true;
    const userId = withAccount ? id('usr', 'tal', seq(opts.index, 5)) : null;

    if (userId) {
      this.buffer.bauth_user.push({
        id: userId,
        email,
        name: `${opts.prenom} ${opts.nom}`,
        emailVerified: false,
        role: 'student',
        createdAt: this.ctx.clock.days(-300),
      });
    }

    this.buffer.talent.push({
      id: talentId,
      userId,
      nom: opts.nom,
      prenom: opts.prenom,
      niveau: opts.niveau,
      // `?? default` would swallow an explicit null, which is the whole point
      // of passing one: Jump holds no number for this talent.
      phone: opts.phone === null ? null : (opts.phone ?? '+33600000000'),
      externalId:
        opts.externalId === null
          ? null
          : (opts.externalId ?? `sf_${seq(opts.index, 6)}`),
      schoolId: opts.schoolId ?? null,
      highSchoolNameManual: opts.highSchoolNameManual ?? null,
      createdAt: this.ctx.clock.days(-300),
    });

    // The anti-corruption mirror. Every talent has one in production (5377 of
    // 5394), because every talent arrives from the CRM.
    this.buffer.talentSfImport.push({
      talentId,
      nom: opts.sfClaims?.nom ?? opts.nom,
      prenom: opts.sfClaims?.prenom ?? opts.prenom,
      sfEmail: email,
      phone: opts.sfClaims?.phone ?? opts.phone ?? '+33600000000',
      niveau: opts.sfClaims?.niveau ?? opts.niveau,
      sfSchoolId: opts.schoolId ?? null,
    });

    const ref: TalentRef = {
      id: talentId,
      userId,
      email,
      prenom: opts.prenom,
      nom: opts.nom,
      niveau: opts.niveau,
      campusId: opts.campus?.id ?? null,
      parentEmail: null,
    };
    this.talents.push(ref);
    this.talentById.set(talentId, ref);
    this.careerByTalent.set(
      talentId,
      opts.career ?? this.careerRng.weighted(CAREER_MIX),
    );
    return ref;
  }

  /**
   * The legal guardian's contact details, and the account that lets them
   * actually sign in.
   *
   * `Talent.parentEmail` is the whole parent workspace: `guards.ts` resolves a
   * guardian's children by matching it against the address they signed in with,
   * so a dataset that never writes it leaves that space with nothing in it, no
   * guardian able to log in, and every « parent en attente » count at zero. The
   * generator wrote it nowhere, which also put ten `BroadcastRecipient` rows in
   * the dataset with a null address on a mail campaign - a row the application
   * could not have produced.
   *
   * Writing the column is not enough on its own: the app never authenticates
   * against it directly, only against a separate `bauth_user` (role `parent`)
   * that `ensureParentAccount` (`onboardingService.ts`) mints the moment the
   * wizard's parents step is submitted. A dataset that writes the column and not
   * the account looks identical everywhere a screen only reads `Talent` - the
   * fiche, the broadcast audience, the compliance figures - and only fails at
   * the one place that matters, the parent login form, which is exactly the gap
   * that made the address-only fix above look complete.
   *
   * `createdAt` is the caller's already-computed parents-step timestamp, so the
   * account is stamped consistently with `Onboarding_Record.parentsValidatedAt`
   * rather than carrying a second, disagreeing date for the same act.
   *
   * Derived from the talent's own address rather than drawn, so it is stable
   * across runs and legible in a mailbox: `responsable.<talent>@seed.invalid`.
   * The reserved TLD is the point, exactly as for the talent (RFC 2606): if an
   * outbound guard is ever wrong, the mail fails at DNS rather than reaching
   * somebody's parent.
   *
   * Returns the addresses so a scenario can name them in the manifest instead of
   * restating how they are built.
   */
  setGuardian(
    talent: TalentRef,
    opts: { createdAt: Date; withSecond?: boolean },
  ): { email: string; secondEmail: string | null } {
    const email = `responsable.${talent.email}`;
    const secondEmail = opts.withSecond ? `responsable2.${talent.email}` : null;
    const row = this.talentRow(talent.id) as Record<string, unknown>;

    row.parentEmail = email;
    row.parentPrenom = GUARDIAN_PRENOM;
    row.parentNom = talent.nom;
    row.parentPhone = GUARDIAN_PHONE;
    row.parentType = PARENT_TYPE_OPTIONS[0].value;
    row.parentCivilite = CIVILITE_OPTIONS[0].value;
    this.provisionGuardianAccount(email, talent.nom, opts.createdAt);

    // Parent-2 is onboarding-collected data only, never a login: the wizard's
    // own comment on the write path is explicit that the whole parent flow is
    // parent-1 - "no account, no email, no portal access" - so this deliberately
    // never calls `provisionGuardianAccount` for `secondEmail`.
    if (secondEmail) {
      row.parent2Email = secondEmail;
      row.parent2Prenom = GUARDIAN_PRENOM;
      row.parent2Nom = talent.nom;
      row.parent2Phone = GUARDIAN_PHONE;
      row.parent2Type = PARENT_TYPE_OPTIONS[1].value;
      row.parent2Civilite = CIVILITE_OPTIONS[1].value;
    }

    talent.parentEmail = email;
    return { email, secondEmail };
  }

  /**
   * Mints the guardian's login, deduped by email.
   *
   * Two callers can name the same address: a talent's own dossier reaching the
   * parents rung, and (for the one family carrying a second guardian) a scenario
   * calling `setGuardian` again to layer `parent2Email` on. `bauth_user.email` is
   * unique, so a second unconditional push would fail the write rather than
   * merely duplicate a row - the same reason `ensureParentAccount` itself looks
   * an existing row up before creating one, and the one part of it worth
   * mirroring here (that function also refreshes the account's `name` on an
   * existing row; nothing in this dataset ever changes a guardian's declared
   * name after the fact, so there is nothing to re-apply on the dedup path).
   */
  private provisionGuardianAccount(
    email: string,
    talentNom: string,
    createdAt: Date,
  ): void {
    if (this.guardianAccounts.has(email)) return;
    this.guardianAccounts.add(email);
    this.buffer.bauth_user.push({
      id: id('usr', 'guardian', email),
      email,
      name: `${GUARDIAN_PRENOM} ${talentNom}`.trim(),
      emailVerified: true,
      role: 'parent',
      createdAt,
    });
  }

  /**
   * What the talent picked at the interests step.
   *
   * Written here rather than in a scenario for the reason `setGuardian` is: the
   * step's timestamps and its rows are one act, and splitting them is what
   * produced a dataset where every dossier had walked past the interests rung
   * and `TalentInterest` held not one row. Nothing failed. The buffer key was
   * declared, the flush ordered it and the wipe deleted it; only the push was
   * missing, so the talent fiche's interests section, the cohort's interest
   * distribution and the broadcast filter that selects on one were all
   * permanently empty, on every profile, with all five checks green.
   *
   * The counts come from `interestsSchema`'s own bounds rather than from numbers
   * repeated here, so a talent carrying more than the wizard accepts cannot be
   * generated.
   */
  pickInterests(talent: TalentRef): void {
    // Once per talent, however many dossiers walk the step. `TalentInterest` is
    // keyed on the pair and belongs to the TALENT, not to the year: a returning
    // student re-answering the question replaces their picks, it does not add a
    // second set. Without this the second dossier redraws and collides on the
    // primary key - and only sometimes, since two draws can happen to be
    // disjoint, which is the worst way for it to fail.
    if (this.talentsWithInterests.has(talent.id)) return;
    this.talentsWithInterests.add(talent.id);

    for (const kind of ['tech', 'general'] as const) {
      const catalogue = this.interests[kind];
      if (catalogue.length === 0) continue;
      const { min, max } = INTEREST_COUNTS[kind];
      const chosen = this.wizardRng.sample(
        catalogue,
        this.wizardRng.int(min, max),
      );
      for (const interestId of chosen) {
        this.buffer.talentInterest.push({ talentId: talent.id, interestId });
      }
    }

    // The free-text box beside the checkboxes. Optional on the form, so both
    // branches have to exist: a dataset where everybody wrote something renders
    // the prose block on every fiche and never its absence, and one where
    // nobody did renders it never.
    if (this.wizardRng.chance(0.35)) {
      const row = this.talentRow(talent.id) as Record<string, unknown>;
      row.interestsFreeText =
        'J’aimerais surtout comprendre comment on fabrique un jeu de A à Z.';
    }
  }

  /** The schooling record, which is CRM-owned and exists for every talent. */
  addSchoolingRecord(
    talent: TalentRef,
    schoolYear: string,
    schoolId: string | null,
  ): void {
    this.buffer.schooling_YearRecord.push({
      id: id('scy', talent.id.replace(/^sd_/, ''), schoolYear),
      talentId: talent.id,
      schoolYear,
      niveau: talent.niveau,
      schoolId,
      source: 'sync',
    });
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  /**
   * The weekdays an event starting `startOffset` days from the anchor runs on,
   * skipping the weekends it would otherwise straddle.
   *
   * Public, and computed by the caller rather than by `addEvent`, because the
   * CRM builds an event's `titre` out of its first day: a scenario cannot name
   * the event it is about to create without knowing the window. The walk itself
   * belongs here - repeated per scenario it would be four chances to disagree
   * about which day an event starts on.
   */
  eventWindow(startOffset: number, weekdays: number): Date[] {
    const days: Date[] = [];
    let cursor = startOffset;
    while (days.length < weekdays) {
      const day = this.ctx.clock.days(cursor);
      const weekday = day.getUTCDay();
      if (weekday !== 0 && weekday !== 6) days.push(day);
      cursor += 1;
    }
    return days;
  }

  addEvent(opts: {
    key: string;
    titre: string;
    publicName?: string | null;
    cohortNoun?: string | null;
    campus: CampusRef;
    /** The weekdays it runs, from {@link eventWindow}. */
    days: readonly Date[];
    startMinutes?: number | null;
    /**
     * Whether the event carries a « date de fin ». Defaults to the two states
     * the application itself produces - see the comment beside `withEndDate`
     * below - so a caller only passes this to place the one in between: an
     * event configured but not activatable because the date is still missing.
     */
    withEndDate?: boolean;
    devActivated?: boolean;
    modules?: readonly string[];
    /** Per-module options, keyed by module. Only some modules take any. */
    moduleSettings?: Readonly<Record<string, Prisma.InputJsonValue>>;
    closingTemplateId?: string | null;
    feedbackFormId?: string | null;
    diplomaTemplateId?: string | null;
    /** Events with no Salesforce origin do not exist in production. */
    externalId?: string | null;
  }): EventRef {
    const eventId = id('evt', opts.campus.name, opts.key);
    const clock = this.ctx.clock;
    const days = [...opts.days];
    const date = days[0]!;

    // « Date de fin ». The Salesforce sync never sends one - it is typed on the
    // configuration screen - which is why `activationBlockerKeys` refuses to
    // make an event visible without it. So the default IS that rule: an
    // activated event has one, an untouched Salesforce row has none, and 36 of
    // production's 277 events carry one for exactly that reason.
    const withEndDate =
      opts.withEndDate ?? (days.length > 1 || opts.devActivated === true);
    // `endDate` is the ONLY column that says an event runs more than one day:
    // every reader derives its days from `date`..`endDate` (`presenceDays`,
    // `stageCountdown`, `talentPlanning`, `dateRangeLabel`), so a caller asking
    // for a window of several days and no end date is asking for a row that
    // cannot carry the second one. The days would be silently dropped, and the
    // caller would keep a `days` array nothing it writes agrees with. Refused
    // here for the same reason the activation gate below is: the generator's
    // own claims about an event have to hold in the row it writes.
    if (!withEndDate && days.length > 1) {
      throw new Error(
        `addEvent(${opts.key}) demande ${days.length} jours sans date de fin, or c’est la date de fin qui porte la durée : les jours suivants ne seraient lus par personne.`,
      );
    }
    // 23:59 in the CAMPUS's timezone, the way production stores it, not midnight
    // UTC - and both readers depend on the difference. `presenceDays` keys the
    // day off the campus clock, so a Réunion event ending at 23:59 UTC would
    // grow a second émargement day; `getEventStatus` compares the instant, so an
    // event ending at midnight reads « passé » from its own first minute.
    const endDate = withEndDate
      ? fromWallClock(
          clock.dateKey(days[days.length - 1]!),
          '23:59',
          opts.campus.timezone,
        )
      : null;

    // The activation gate, enforced where the row is written instead of checked
    // afterwards. `activationBlockerKeys` is what both the configuration dialog
    // and the admin API refuse an activation on, so an activated event missing
    // any of the three is a state no human could have reached - and a dev space
    // showing an event its own configuration screen calls impossible is the one
    // thing a seeded environment must not do. It was reachable: every
    // single-day event had a null `endDate`, and `longTail` activated a fifth of
    // them.
    if (opts.devActivated) {
      const blockers = activationBlockers({
        publicName: opts.publicName ?? null,
        cohortNoun: opts.cohortNoun ?? null,
        endDate: endDate === null ? null : endDate.toISOString(),
        modules: opts.modules ?? [],
        devActivated: true,
      });
      if (blockers.length > 0) {
        throw new Error(
          `addEvent(${opts.key}) active un événement que l’application refuserait d’activer, il lui manque : ${blockers.join(', ')}.`,
        );
      }
    }

    this.buffer.event.push({
      id: eventId,
      titre: opts.titre,
      publicName: opts.publicName ?? null,
      cohortNoun: opts.cohortNoun ?? null,
      date,
      endDate,
      startMinutes: opts.startMinutes ?? null,
      campusId: opts.campus.id,
      externalId:
        opts.externalId === null
          ? null
          : (opts.externalId ?? id('sfc', opts.campus.name, opts.key)),
      devActivatedAt: opts.devActivated ? clock.days(-30) : null,
      closingTemplateId: opts.closingTemplateId ?? null,
      feedbackFormId: opts.feedbackFormId ?? null,
      diplomaTemplateId: opts.diplomaTemplateId ?? null,
    });

    for (const moduleKey of opts.modules ?? []) {
      this.buffer.eventConfig_Module.push({
        eventId,
        moduleKey,
        // The optional settings bag, validated app-side by a per-module Zod
        // schema. It was `undefined` on every row in the dataset, so neither the
        // schema nor the readers that branch on a setting had anything to run
        // against; the module that actually carries options gets one.
        settings: opts.moduleSettings?.[moduleKey],
      });
    }

    const ref: EventRef = {
      id: eventId,
      titre: opts.titre,
      publicName: opts.publicName ?? null,
      campusId: opts.campus.id,
      campusName: opts.campus.name,
      date,
      endDate,
      days,
      closingTemplateId: opts.closingTemplateId ?? null,
    };
    this.events.push(ref);
    this.roster.set(eventId, []);
    return ref;
  }

  /**
   * Enrols a talent, deriving the Salesforce member status unless told one.
   *
   * Omit `opts` and the row is VISIBLE in the dev space, and plausible for when
   * the event happens: `MEET` or `READY` once it has started, `READY` only
   * before. Pass `{ sfMemberStatus: null }` for a legacy row synced before the
   * column existed, or a hidden status to put one where a screen needs it - both
   * of which the `statuts-salesforce` scenario does, and nothing else should.
   *
   * An explicit status consumes no draw, so placing one has no effect on any
   * other row in the dataset.
   */
  enrol(
    event: EventRef,
    talent: TalentRef,
    opts?: { sfMemberStatus: SfMemberStatus | null },
  ): void {
    const sfMemberStatus =
      opts === undefined
        ? this.sfRng.weighted(
            event.date > this.ctx.clock.today
              ? UPCOMING_EVENT_SF_MIX
              : STARTED_EVENT_SF_MIX,
          )
        : opts.sfMemberStatus;

    this.buffer.participation.push({
      id: id(
        'prt',
        event.id.replace(/^sd_/, ''),
        talent.id.replace(/^sd_/, ''),
      ),
      talentId: talent.id,
      eventId: event.id,
      campusId: event.campusId,
      sfMemberStatus,
    });
    this.roster.get(event.id)!.push(talent);
    let attended = this.enrolledEventsByTalent.get(talent.id);
    if (!attended) {
      attended = new Set<string>();
      this.enrolledEventsByTalent.set(talent.id, attended);
    }
    attended.add(event.id);
  }

  /**
   * Talents who have already been to something on this campus and whose career
   * has room for more.
   *
   * This is what stops the dataset being 97% one-timers. Every cohort used to
   * be minted from scratch (`makeCohort`), so nobody ever came twice except the
   * two dozen club regulars on a single campus - which left « Son parcours »,
   * the verdict-to-verdict comparison and every multi-closing screen with no
   * example to render, on a platform where production has 31% of its talents
   * coming back at least once.
   *
   * Scoped to ONE campus, deliberately. A talent's campus is derived from their
   * most recent enrolment, and PROFILE.md records that no enrolment in
   * production is misaligned with its event's campus. The one talent on two
   * campuses stays the `roamer` placed in `edgeTalents`, whose whole job is to
   * prove that derivation rather than let it be assumed.
   *
   * Room for ONE more, and never for a caller's whole season. The pool used to
   * take a `minHeadroom`, which the club passed its ten sessions: since
   * `CAREER_MIX` stops at eleven and every candidate has already been
   * somewhere, that asked for a career of eleven exactly - 0.04% of the draw,
   * so the pool came back empty on essentially every run and the club's third
   * of returning regulars was silently always zero. A caller that means to
   * enrol somebody on a whole season is not asking the histogram for room, it
   * is declaring them a regular, which is `placeCareer`.
   */
  returningPool(opts: { campusId: string }): TalentRef[] {
    return this.talents.filter((talent) => {
      if (talent.campusId !== opts.campusId) return false;
      const attended = this.enrolledEventsByTalent.get(talent.id);
      // Never been to anything: they are not a returning talent yet, they are
      // the cohort somebody is about to mint.
      if (!attended || attended.size === 0) return false;
      const career = this.careerByTalent.get(talent.id) ?? 1;
      return career - attended.size >= 1;
    });
  }

  /**
   * Declares a talent a regular: `events` more than they have already attended,
   * whatever `CAREER_MIX` drew for them.
   *
   * The twin of `addTalent`'s own `career`, for a talent who already exists.
   * Both place rather than draw, and the split is the moment, not the rule: at
   * birth the career is placed instead of drawn and consumes no draw, which is
   * what lets a placed talent leave every other talent's career untouched;
   * here the draw has already happened and is overridden.
   *
   * Placing is what the histogram's own tail asks for rather than a departure
   * from it. Production's talents at nine, ten and eleven events got there
   * through a recurring format, which is the Coding Club and nothing else in
   * this dataset - so the scenario that runs the season is precisely the one
   * entitled to say who its regulars are, exactly as it already does for the
   * talents it mints. Asking the draw for them instead is asking for 0.06% of
   * the population to land on one campus, which is none at every profile but
   * `staging` and barely any there.
   *
   * Counted from what they have ALREADY attended, so « a season on top of a
   * stage » is eleven and not ten, and the pool stops offering them at the
   * right point instead of one event early.
   */
  placeCareer(talent: TalentRef, events: number): void {
    const attended = this.enrolledEventsByTalent.get(talent.id)?.size ?? 0;
    this.careerByTalent.set(talent.id, attended + events);
  }

  /** Whether this talent is already on this event, so nobody enrols them twice. */
  isEnrolled(talentId: string, eventId: string): boolean {
    return this.enrolledEventsByTalent.get(talentId)?.has(eventId) ?? false;
  }

  /**
   * Publications this talent has already played.
   *
   * `MinigameAttempt` is unique on `(talentId, publicationId)`, and three
   * places now write attempts: the flagship stage, the daily rotation, and the
   * placed profiles that carry the top of the board. A caller that DRAWS its
   * publications asks this first and excludes what comes back.
   */
  playedBy(talentId: string): ReadonlySet<string> {
    return this.playedByTalent.get(talentId) ?? EMPTY_SET;
  }

  /**
   * Whether this talent already filed a dossier for this school year.
   *
   * A dossier is per talent and per YEAR, not per event, and the returning pool
   * is what made the difference matter: a talent recruited onto their third
   * event by `longue-traine` may well have filed one at the stage already, and
   * the 2% draw there would hand them a second for the same year. The first
   * version of the pool did exactly that and `Onboarding_Record`'s primary key
   * caught it - which is the good outcome, but a caller that DRAWS should not
   * be relying on a constraint to tell it who has already been through the
   * wizard.
   */
  hasDossier(talentId: string, schoolYear: string): boolean {
    return this.dossierYears.get(talentId)?.has(schoolYear) ?? false;
  }

  /** Claims the `(talent, year)` dossier, and refuses a second claim. */
  noteDossier(talentId: string, schoolYear: string): void {
    let years = this.dossierYears.get(talentId);
    if (!years) {
      years = new Set<string>();
      this.dossierYears.set(talentId, years);
    }
    if (years.has(schoolYear)) {
      throw new Error(
        `${talentId} a déjà un dossier ${schoolYear} : un dossier est annuel, pas par événement. Testez world.hasDossier() avant de tirer.`,
      );
    }
    years.add(schoolYear);
  }

  /**
   * Claims the `(talent, publication)` pair, and refuses a second claim.
   *
   * Loud rather than forgiving, deliberately. A silent skip here would turn
   * « this talent won ten times » into nine wins and a shrug, which is exactly
   * the class of quiet arithmetic the ranking rewrite exists to remove.
   */
  notePlayed(talentId: string, publicationId: string): void {
    let played = this.playedByTalent.get(talentId);
    if (!played) {
      played = new Set<string>();
      this.playedByTalent.set(talentId, played);
    }
    if (played.has(publicationId)) {
      throw new Error(
        `${talentId} a déjà une partie sur ${publicationId} : MinigameAttempt est unique sur le couple. Excluez world.playedBy() avant de tirer.`,
      );
    }
    played.add(publicationId);
  }

  /**
   * Removes a participation the world already buffered, leaving whatever it
   * already produced (a closing, a presence mark) standing.
   *
   * This is not a general-purpose delete: it exists to simulate the one thing
   * this generator cannot otherwise reach, an external system's hard delete
   * arriving after the fact. `Closing_Record` carries no foreign key to
   * `Participation` for exactly this reason - see the schema's own comment on
   * that model - and the only way to prove the decoupling holds is a dataset
   * that actually contains a closing whose participation is gone.
   */
  pruneParticipation(eventId: string, talentId: string): void {
    const participationId = id(
      'prt',
      eventId.replace(/^sd_/, ''),
      talentId.replace(/^sd_/, ''),
    );
    const index = this.buffer.participation.findIndex(
      (row) => row.id === participationId,
    );
    if (index === -1) {
      throw new Error(
        `pruneParticipation: no participation ${participationId} to prune.`,
      );
    }
    this.buffer.participation.splice(index, 1);
    const roster = this.roster.get(eventId);
    if (roster) {
      const rosterIndex = roster.findIndex((talent) => talent.id === talentId);
      if (rosterIndex !== -1) roster.splice(rosterIndex, 1);
    }
    // And the talent's own side of it, or their career reads as spent on an
    // enrolment that no longer exists and `returningPool` keeps refusing them
    // an event they are no longer on.
    this.enrolledEventsByTalent.get(talentId)?.delete(eventId);
  }

  addPlanning(event: EventRef, blueprint: readonly SlotBlueprint[]): void {
    for (const [index, slot] of blueprint.entries()) {
      const day = event.days[slot.day];
      if (!day) continue;
      const start = new Date(day);
      start.setUTCHours(slot.start[0], slot.start[1], 0, 0);
      const end = new Date(day);
      end.setUTCHours(slot.end[0], slot.end[1], 0, 0);
      this.buffer.planning_Slot.push({
        id: id('pls', event.id.replace(/^sd_/, ''), seq(index, 3)),
        eventId: event.id,
        startTime: start,
        endTime: end,
        nom: slot.nom,
        activityType: slot.activityType,
      });
    }
  }

  /**
   * One émargement cell.
   *
   * Who marked it is DERIVED from how it was produced, never passed through: a
   * `qr` row is the talent scanning themselves in and a `system` row is the
   * platform filling a half-day nobody touched, so neither has a staff member
   * behind it, and a `system` row was never "marked" at all. The generator used
   * to attribute all three to whoever the scenario happened to pick, which put a
   * team member's name on every self-check-in on the émargement screen and left
   * both nullable columns without a single null row - so the "aucun marqueur"
   * rendering that `markedById` is nullable FOR had no example anywhere.
   */
  markPresence(opts: {
    event: EventRef;
    talent: TalentRef;
    day: Date;
    slot: PresenceSlot;
    status: PresenceStatus;
    source: PresenceSource;
    /** Attributed only to a `manual` mark. Ignored for `qr` and `system`. */
    markedBy: StaffRef | null;
  }): void {
    const markedBy = opts.source === 'manual' ? opts.markedBy : null;
    this.buffer.eventPresence.push({
      id: id(
        'epr',
        opts.event.id.replace(/^sd_/, ''),
        opts.talent.id.replace(/^sd_/, ''),
        this.ctx.clock.dateKey(opts.day),
        opts.slot,
      ),
      talentId: opts.talent.id,
      eventId: opts.event.id,
      day: opts.day,
      slot: opts.slot,
      status: opts.status,
      source: opts.source,
      markedById: markedBy?.id ?? null,
      // A `system` cell was never marked: it is what the platform recorded for a
      // half-day nobody opened, so there is no moment to stamp.
      markedAt: opts.source === 'system' ? null : opts.day,
    });
    if (opts.status === 'present' || opts.status === 'late') {
      const seen =
        this.presentEventsByTalent.get(opts.talent.id) ?? new Set<string>();
      seen.add(opts.event.id);
      this.presentEventsByTalent.set(opts.talent.id, seen);
    }
  }

  closeSlot(
    event: EventRef,
    day: Date,
    slot: PresenceSlot,
    closedBy: StaffRef | null,
  ): void {
    this.buffer.eventPresenceClosure.push({
      id: id(
        'epc',
        event.id.replace(/^sd_/, ''),
        this.ctx.clock.dateKey(day),
        slot,
      ),
      eventId: event.id,
      day,
      slot,
      closedById: closedBy?.id ?? null,
      closedAt: day,
    });
  }

  // ─── XP ───────────────────────────────────────────────────────────────────

  /**
   * Appends an XP fact. `Talent.xp` is never written here: it is a projection,
   * recomputed once in `finalize()` from exactly these rows, which is the same
   * contract `xpService` holds inside a transaction.
   */
  grantXp(opts: {
    talent: TalentRef;
    source: XpGrantSource;
    sourceId: string | null;
    amount: number;
    campusId?: string | null;
    /**
     * When the granting fact happened. A ledger row whose date is not its
     * fact's date is a row the application could not have written: the talent's
     * own `/xp` page orders by `createdAt` and `xpStoryService` prints a date
     * label per grant, so a dataset stamping every row on one day renders the
     * whole history as an undated block in arbitrary order. It survived as long
     * as it did because there were seventeen minigame grants to look at; the
     * daily rotation puts that in the thousands.
     */
    at?: Date;
  }): void {
    this.buffer.xpGrant.push({
      id: id(
        'xpg',
        opts.source,
        opts.sourceId ?? opts.talent.id.replace(/^sd_/, ''),
      ),
      talentId: opts.talent.id,
      campusId: opts.campusId ?? opts.talent.campusId,
      source: opts.source,
      sourceId: opts.sourceId,
      amount: opts.amount,
      createdAt: opts.at ?? this.ctx.clock.days(-20),
    });
    this.xpByTalent.set(
      opts.talent.id,
      (this.xpByTalent.get(opts.talent.id) ?? 0) + opts.amount,
    );
  }

  /**
   * One image-rights decision, as the source that produced it would have left
   * it.
   *
   * The two sources write different columns, and writing both blocks on every
   * row is what the generator used to do. A staff correction is not a signature:
   * nobody signed anything, so there is no signer, no relationship, no city and
   * no document version to pin - there is a member of the team, a note saying
   * why, and the decision itself. Filling a signer's name in anyway produces a
   * record that reads, on the archive screen and in the exported document, as
   * though a guardian had signed something they never saw.
   */
  imageRightsDecision(opts: {
    talent: TalentRef;
    decision: ImageRightsDecision;
    schoolYear: string;
    version: string;
    decidedAt: Date;
    source?: 'parent_portal' | 'staff_correction';
    recordedByStaffId?: string | null;
    note?: string;
  }): void {
    const source = opts.source ?? 'parent_portal';
    const signed = source === 'parent_portal';
    this.buffer.imageRightsDecisionRecord.push({
      id: id(
        'ird',
        opts.talent.id.replace(/^sd_/, ''),
        opts.schoolYear,
        opts.decision,
      ),
      talentId: opts.talent.id,
      decision: opts.decision,
      schoolYear: opts.schoolYear,
      version: signed ? opts.version : null,
      decidedAt: opts.decidedAt,
      signerPrenom: signed ? 'Responsable' : null,
      signerNom: signed ? opts.talent.nom : null,
      relationship: signed ? 'Parent' : null,
      city: signed ? 'Paris' : null,
      note: opts.note ?? null,
      source,
      recordedByStaffId: opts.recordedByStaffId ?? null,
    });
  }

  /**
   * Recomputes the two cached projections from the facts just buffered.
   *
   * They are computed rather than declared for the same reason the app
   * recomputes them inside the writing transaction: a hand-set `xp` that does
   * not equal the sum of its grants is a dataset that disagrees with itself, and
   * every screen showing the ledger next to the total would show the
   * disagreement.
   */
  finalize(): void {
    // Before the XP projection, because it grants XP.
    this.rankMinigameFields();
    for (const row of this.buffer.talent) {
      const talentId = row.id as string;
      row.xp = this.xpByTalent.get(talentId) ?? 0;
      row.eventsCount = this.presentEventsByTalent.get(talentId)?.size ?? 0;
    }
  }

  /**
   * Awards the ranking bonus on every finished attempt, the way the application
   * awards it.
   *
   * **A rank is a property of the field, not of an attempt.** It used to be
   * passed in per attempt - `rank: index + 1`, `fieldSize` a guess at the cohort
   * size - which meant the stored bonus and the board the application computes
   * from the same rows were two unrelated numbers that happened to sit in the
   * same table. Twenty attempts made that invisible. It stops being invisible
   * the moment a talent is meant to have won ten times, because « won » is then
   * a claim the leaderboard can contradict. So a scenario places a RESULT and
   * never a rank: you come first by being fast, which is also how it works for
   * the talent.
   *
   * Two properties of the real thing decide the shape, and both are read off
   * `minigameService.finishAttempt` rather than guessed:
   *
   * **The board is per CAMPUS**, not per publication - `rankOnCampusBoard`, and
   * the `[campusId, publicationId]` index that exists for it. Ranking one field
   * per publication produced 329 bonuses where production has 1 472, because
   * production's 64 publications are really about 900 boards.
   *
   * **And there is no clawback**: the bonus is the rank you held THE MOMENT you
   * finished, never revised when somebody beats it later. So the runs are
   * walked in the order they finished and each is ranked against the board AS
   * IT STOOD, itself included - which is why the first finisher of every board
   * carries a first place, and why a board can hold several of them. That is
   * not a rounding artefact of the real system, it is its stated semantics
   * ("an early leader keeps it even once overtaken"), and it is most of the
   * difference between 1 472 bonuses and a tidy podium per board.
   *
   * The amounts come from the domain (`minigameRankBonus`), so the generator
   * cannot drift from the rule the finish callback applies.
   */
  private rankMinigameFields(): void {
    const scoringByPublication = new Map<string, string>();
    for (const publication of this.buffer.minigamePublication) {
      scoringByPublication.set(
        publication.id as string,
        publication.scoringType as string,
      );
    }

    // One board per (publication, campus). A run with no campus at all - the
    // talent placed by `talents-limites` who belongs to none - ranks on the
    // global board, which is the fallback `minigameService` uses for exactly
    // that row.
    const boards = new Map<string, typeof this.buffer.minigameAttempt>();
    for (const attempt of this.buffer.minigameAttempt) {
      if (attempt.status !== 'done') continue;
      const key = `${attempt.publicationId as string}|${
        (attempt.campusId as string | null) ?? 'global'
      }`;
      const board = boards.get(key);
      if (board) board.push(attempt);
      else boards.set(key, [attempt]);
    }

    for (const [key, board] of boards) {
      const scored =
        scoringByPublication.get(key.slice(0, key.lastIndexOf('|'))) ===
        'score';
      // Finish order. The id breaks a tie so two runs stamped at the same
      // minute are ordered the same way on every run of the generator, rather
      // than by whichever `sort` happened to visit first.
      const byFinish = [...board].sort((a, b) => {
        const left = (a.finishedAt as Date).getTime();
        const right = (b.finishedAt as Date).getTime();
        if (left !== right) return left - right;
        return (a.id as string).localeCompare(b.id as string);
      });

      const better = (
        candidate: (typeof board)[number],
        against: (typeof board)[number],
      ): boolean => {
        const left = (scored ? candidate.score : candidate.chrono) ?? 0;
        const right = (scored ? against.score : against.chrono) ?? 0;
        // A score game ranks high-to-low, a chrono game low-to-high.
        return scored ? left > right : left < right;
      };

      for (const [index, attempt] of byFinish.entries()) {
        // The board as it stood: everybody who had already finished, plus this
        // run. Rank is one more than however many of them were better.
        const fieldSize = index + 1;
        const ahead = byFinish
          .slice(0, index)
          .filter((earlier) => better(earlier, attempt)).length;
        const rank = ahead + 1;
        if (rank > minigameRankBonusLimit(fieldSize)) continue;
        const bonus = minigameRankBonus(rank, fieldSize);
        if (bonus <= 0) continue;
        attempt.rankXpAwarded = bonus;
        // The rank float is gated on its own column, so it follows whether the
        // finish itself was celebrated: an attempt whose `+50` is still unseen
        // has not shown its bonus either.
        attempt.rankXpSeenAt = attempt.xpSeenAt ?? null;
        const talent = this.talentById.get(attempt.talentId as string);
        if (!talent) continue;
        this.grantXp({
          talent,
          source: 'minigame_rank',
          sourceId: attempt.id as string,
          amount: bonus,
          at: (attempt.finishedAt as Date | null) ?? undefined,
        });
      }
    }
  }
}
