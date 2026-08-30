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

  /** Broadcast templates, written by the catalogue and read back by the runner. */
  readonly broadcastTemplates: { id: string; channel: 'mail' | 'sms' }[] = [];

  /** The stage grid the migration carries, resolved by the runner. */
  stageTemplateId: string | null = null;
  /** The certificate the migration carries, resolved by the runner. */
  diplomaTemplateId: string | null = null;

  private talentCounter = 0;
  private xpByTalent = new Map<string, number>();
  private presentEventsByTalent = new Map<string, Set<string>>();

  constructor(readonly ctx: SeedContext) {}

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
      externalName: spec.name,
      timezone: spec.timezone,
      contactEmail: `${slug(spec.name)}@${STAFF_MAIL_DOMAIN}`,
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
      phone: opts.phone ?? '+33600000000',
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
        settings: undefined,
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

  enrol(
    event: EventRef,
    talent: TalentRef,
    sfMemberStatus: string | null = null,
  ): void {
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

  markPresence(opts: {
    event: EventRef;
    talent: TalentRef;
    day: Date;
    slot: PresenceSlot;
    status: PresenceStatus;
    source: PresenceSource;
    markedBy: StaffRef | null;
  }): void {
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
      markedById: opts.markedBy?.id ?? null,
      markedAt: opts.day,
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

  imageRightsDecision(opts: {
    talent: TalentRef;
    decision: ImageRightsDecision;
    schoolYear: string;
    version: string;
    decidedAt: Date;
    source?: 'parent_portal' | 'staff_correction';
    recordedByStaffId?: string | null;
  }): void {
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
      version: opts.version,
      decidedAt: opts.decidedAt,
      signerPrenom: 'Responsable',
      signerNom: opts.talent.nom,
      relationship: 'Parent',
      city: 'Paris',
      source: opts.source ?? 'parent_portal',
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
