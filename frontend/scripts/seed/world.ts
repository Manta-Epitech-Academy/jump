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

export type CampusRef = { id: string; name: string; timezone: string };
export type StaffRef = {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  campusId: string | null;
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
  readonly schools = new Map<string, string>();
  readonly staff: StaffRef[] = [];
  readonly talents: TalentRef[] = [];
  readonly events: EventRef[] = [];
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

  constructor(readonly ctx: SeedContext) {
    this.sfRng = ctx.rng.fork('sfMemberStatus');
    this.wizardRng = ctx.rng.fork('wizard');
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

  addSchool(spec: SchoolSpec): string {
    const schoolId = id('sch', spec.uai);
    this.buffer.school.push({
      id: schoolId,
      uai: spec.uai,
      name: spec.name,
      city: spec.city,
      postalCode: spec.postalCode,
      inseeCode: spec.postalCode,
      resolvedAt: this.ctx.clock.days(-400),
    });
    this.schools.set(spec.uai, schoolId);
    return schoolId;
  }

  // ─── Staff ────────────────────────────────────────────────────────────────

  addStaff(opts: {
    prenom: string;
    nom: string;
    role: StaffRole;
    campus: CampusRef | null;
    /** A member who has an account but has never opened it. */
    neverLoggedIn?: boolean;
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
      firstLoginAt: opts.neverLoggedIn ? null : this.ctx.clock.days(-480),
      lastActiveAt: opts.neverLoggedIn ? null : this.ctx.clock.days(-2),
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
    };
    this.staff.push(ref);
    return ref;
  }

  staffFor(campusId: string): StaffRef[] {
    return this.staff.filter((member) => member.campusId === campusId);
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
   * The legal guardian's contact details.
   *
   * `Talent.parentEmail` is the whole parent workspace: `guards.ts` resolves a
   * guardian's children by matching it against the address they signed in with,
   * so a dataset that never writes it leaves that space with nothing in it, no
   * guardian able to log in, and every « parent en attente » count at zero. The
   * generator wrote it nowhere, which also put ten `BroadcastRecipient` rows in
   * the dataset with a null address on a mail campaign - a row the application
   * could not have produced.
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
    opts: { withSecond?: boolean } = {},
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

  addEvent(opts: {
    key: string;
    titre: string;
    publicName?: string | null;
    cohortNoun?: string | null;
    campus: CampusRef;
    /** Day offset from the anchor. Negative is in the past. */
    startOffset: number;
    /** How many weekdays the event runs. 1 for a single-day format. */
    weekdays: number;
    startMinutes?: number | null;
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
    const days: Date[] = [];
    let cursor = opts.startOffset;
    while (days.length < opts.weekdays) {
      const day = clock.days(cursor);
      const weekday = day.getUTCDay();
      if (weekday !== 0 && weekday !== 6) days.push(day);
      cursor += 1;
    }
    const date = days[0]!;
    const endDate = opts.weekdays > 1 ? days[days.length - 1]! : null;

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
