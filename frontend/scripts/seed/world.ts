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
 * The fact everything else about their activity is derived from: the usage
 * rows, the session rows, and `StaffProfile.lastActiveAt`. Generated here rather
 * than in the usage factory because it describes the PERSON, and because two
 * generators writing what one person did is exactly how the dataset ended up
 * claiming a member had four months of feature use and two connections on
 * unrelated days.
 */
export type StaffVisit = {
  /** Days before the anchor, negative. */
  readonly dayOffset: number;
  readonly space: 'dev' | 'admin';
  /**
   * The login this visit belongs to. A BetterAuth session lives a fortnight
   * (`auth.ts`), so several days share one, which is the whole reason a login
   * count under-reports somebody who never signs out.
   */
  readonly sessionKey: string;
  /** True on the visit that opened that session: the one that writes the row. */
  readonly opensSession: boolean;
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
 * retention, which is the state whose dialog says « aucune connexion
 * enregistrée sur les 12 derniers mois » while the two dates above it are still
 * set - precisely why those dates do not come from the usage rows.
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

  /** The stage grid the migration carries, resolved by the runner. */
  stageTemplateId: string | null = null;
  /** The certificate the migration carries, resolved by the runner. */
  diplomaTemplateId: string | null = null;

  private talentCounter = 0;
  private readonly talentsWithInterests = new Set<string>();
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

  constructor(readonly ctx: SeedContext) {
    this.sfRng = ctx.rng.fork('sfMemberStatus');
    this.wizardRng = ctx.rng.fork('wizard');
    this.staffRng = ctx.rng.fork('staffActivity');
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
      // No external name, and that IS the worker isolation: `listCampuses` only
      // hands the worker campuses Jump has mapped to Salesforce, so a seeded
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

    const visits: StaffVisit[] = [];
    let sessionStart: number | null = null;
    let session = 0;
    for (const dayOffset of days) {
      // A BetterAuth session lives fourteen days, so a run of visits inside one
      // fortnight is ONE login. That is the whole reason a login count and a
      // day count disagree, and a dataset that never produces the disagreement
      // cannot show it.
      if (sessionStart === null || dayOffset - sessionStart > 14) {
        sessionStart = dayOffset;
        session += 1;
      }
      visits.push({
        dayOffset,
        // Only an admin ever leaves their own space, and rarely: a dev has no
        // admin space to open.
        space: role === 'admin' && session % 4 === 0 ? away : home,
        sessionKey: `s${seq(session, 3)}`,
        opensSession: dayOffset === sessionStart,
      });
    }
    return visits;
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
      createdAt: this.ctx.clock.days(-20),
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
    for (const row of this.buffer.talent) {
      const talentId = row.id as string;
      row.xp = this.xpByTalent.get(talentId) ?? 0;
      row.eventsCount = this.presentEventsByTalent.get(talentId)?.size ?? 0;
    }
  }
}
