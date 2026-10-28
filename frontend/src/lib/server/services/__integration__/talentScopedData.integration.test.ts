import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { anonymizeTalent } from '$lib/server/services/anonymizationService';
import {
  resetTalentToImport,
  TalentAlreadyErased,
} from '$lib/server/services/talentAccount';
import { loadDatamodel } from '../../../../../scripts/seed/schema';
import { assertTestDatabase } from './testDatabase';

/**
 * What the RGPD erasure (`anonymizeTalent`) and the admin reset to import
 * (`resetTalentToImport`) do to every row and every column that belongs to a
 * talent, checked on a real database against a classification each table and
 * each `Talent` column must carry.
 *
 * Both functions enumerate the talent's tables by hand, which is the only thing
 * they can do and the reason a new table gets forgotten: the interview free
 * text and three sibling tables survived erasure until a review caught them,
 * `Workshop_Participation` survived a reset, and the legacy `rulesFilePath`
 * kept the key of a PDF both paths delete. A test that restated their lists
 * would pass by agreeing with the bug, so this one asks the schema instead:
 * every model holding a talent's rows (a relation to `Talent`, or a scalar
 * `*talentId`) and every `Talent` column must be classified below, for each
 * operation, with the reason. A new table or column fails here until somebody
 * decides what an erasure and a reset do to it, and the fixture then proves the
 * code does it.
 *
 * Its blind spot: a table that names a talent by anything else than a `Talent`
 * foreign key or a `*talentId` column is invisible to the walk, so those are
 * listed by hand in `BY_OTHER_IDENTITY`.
 *
 * The two records are separate on purpose. Erasure and reset are different
 * operations that classify tables differently (staff notes survive a reset, not
 * an erasure), and nothing here makes one follow the other.
 */

const deletedObjects = vi.hoisted(() => [] as string[]);
vi.mock('$lib/server/infra/storage', () => ({
  getStorage: () => ({
    delete: async (key: string) => {
      deletedObjects.push(key);
    },
  }),
}));

/** What an operation does to a talent's rows in one table. */
type TableFate =
  /** None of the talent's rows survive. */
  | { fate: 'delete'; why: string }
  /** Every row the talent had survives unchanged (new rows are allowed). */
  | { fate: 'keep'; why: string }
  /** The rows survive with the listed columns changed and the others equal. */
  | { fate: 'scrub'; columns: readonly string[]; why: string };

/** What an operation does to a group of `Talent` columns. */
type ColumnGroup = {
  /** keep = unchanged, null = cleared, rewrite = set to another non-null value. */
  fate: 'keep' | 'null' | 'rewrite';
  why: string;
  columns: readonly Prisma.TalentScalarFieldEnum[];
};

/** Which of a talent's identities a column names them by. */
type Identity = 'talentId' | 'externalId' | 'email';

/** A column that names a talent, and by which identity. */
type TalentColumn = { column: string; holds: Identity };

/**
 * Tables that name a talent by anything else than a foreign key, which the
 * schema walk cannot see: by their Salesforce id, or by the address they log in
 * with. `SyncError` does both, the second when another contact claimed the
 * talent's address.
 */
const BY_OTHER_IDENTITY: Record<string, readonly TalentColumn[]> = {
  SyncError: [
    { column: 'attemptedExtId', holds: 'externalId' },
    { column: 'existingExtId', holds: 'externalId' },
    { column: 'email', holds: 'email' },
  ],
};

type Policy = {
  tables: Partial<Record<Prisma.ModelName, TableFate>>;
  talent: readonly ColumnGroup[];
};

/** The onboarding timeline, every step the talent took. */
const ONBOARDING_TIMELINE = [
  'welcomeSeenAt',
  'charterAcceptedAt',
  'infoValidatedAt',
  'highSchoolValidatedAt',
  'parentsValidatedAt',
  'techInterestsValidatedAt',
  'generalInterestsValidatedAt',
  'interestsRecapSeenAt',
  'equipmentValidatedAt',
  'processingCompletedAt',
  'rulesSignedAt',
] as const;

/** The guardian's two signed acts, projected from the dossier. */
const GUARDIAN_ACTS = [
  'imageRightsDecision',
  'imageRightsDecidedAt',
  'imageRightsSignerPrenom',
  'imageRightsSignerNom',
  'imageRightsFilePath',
  'parentRulesSignedAt',
  'parentRulesSignerPrenom',
  'parentRulesSignerNom',
  'parentRulesRelationship',
  'parentRulesSignedCity',
] as const;

/** Both guardians' contact details. */
const GUARDIAN_CONTACTS = [
  'parentType',
  'parentCivilite',
  'parentNom',
  'parentPrenom',
  'parentEmail',
  'parentPhone',
  'parent2Type',
  'parent2Civilite',
  'parent2Nom',
  'parent2Prenom',
  'parent2Email',
  'parent2Phone',
] as const;

const ERASURE: Policy = {
  tables: {
    TalentSfImport: {
      fate: 'delete',
      why: "The Salesforce mirror holds the talent's name, email and phone.",
    },
    TalentInterest: {
      fate: 'delete',
      why: 'What a named minor said they like.',
    },
    Schooling_YearRecord: {
      fate: 'delete',
      why: 'Which lycée a named minor attended, year by year: all of it goes.',
    },
    Onboarding_Record: {
      fate: 'delete',
      why: "The dossier embeds the guardian's typed name and both places of signature.",
    },
    ImageRightsDecisionRecord: {
      fate: 'delete',
      why: "The image-rights ledger carries the guardian's typed name.",
    },
    Note_TalentNote: {
      fate: 'delete',
      why: 'Staff free text about the minor.',
    },
    Feedback_Submission: {
      fate: 'delete',
      why: "A bilan's answers are the talent's own free text.",
    },
    Closing_Record: {
      fate: 'delete',
      why: "The verdict and per-question notes are staff free text about the minor; it is their closing's only copy.",
    },
    Closing_ResetEvent: {
      fate: 'delete',
      why: "A closing reset's trace and its free-text reason.",
    },
    OnboardingPdfJob: {
      fate: 'delete',
      why: 'Which documents were rendered for the minor, for which years, and when.',
    },
    BroadcastRecipient: {
      fate: 'delete',
      why: "Each send's address or number, the talent's and the parent's (a data subject too).",
    },
    Participation: {
      fate: 'keep',
      why: 'De-identified enrolment once the name is gone; it backs eventsCount and every cohort figure.',
    },
    EventPresence: {
      fate: 'keep',
      why: 'De-identified attendance, the source eventsCount projects from.',
    },
    MinigameAttempt: {
      fate: 'keep',
      why: 'De-identified play, kept for the leaderboards and the XP it backs.',
    },
    XpGrant: {
      fate: 'keep',
      why: 'The XP ledger, which xp projects from; no identity in it.',
    },
    Workshop_Participation: {
      fate: 'keep',
      why: 'Ids and counters only; the CTFd accounts are erased by the instances, which ask /api/workshops/erasures.',
    },
    AuthIdentityRepair: {
      fate: 'scrub',
      columns: ['fromEmail', 'toEmail'],
      why: 'An operational audit row: kept as a fact, its two addresses replaced.',
    },
    TalentDeletionRequest: {
      fate: 'scrub',
      columns: ['reason', 'resolutionNote'],
      why: 'Fulfilled, it is the proof of erasure, so it stays without its free text.',
    },
    SyncError: {
      fate: 'delete',
      why: "What the sync could not reconcile, logged with the contact's name and address.",
    },
  },
  talent: [
    {
      fate: 'keep',
      why: 'The row itself, its login link and its creation date: the erased talent stays a row that figures count.',
      columns: ['id', 'userId', 'createdAt'],
    },
    {
      fate: 'keep',
      why: 'De-identified figures the stats are built on.',
      columns: ['xp', 'eventsCount'],
    },
    {
      fate: 'keep',
      why: 'The activity facts the retention figures read (cohortProfile counts the connected, featureUsage the population), with no identity in them.',
      columns: ['lastActiveAt', 'firstLoginAt'],
    },
    {
      fate: 'keep',
      why: 'A privacy preference the talent set, harmless to keep.',
      columns: ['usageAnalyticsOptOutAt'],
    },
    {
      fate: 'rewrite',
      why: 'The name becomes a placeholder; the row stays one that lists and figures can carry.',
      columns: ['nom', 'prenom'],
    },
    {
      fate: 'rewrite',
      why: 'Stamped once: the fact every reader of "is this talent erased" checks.',
      columns: ['anonymizedAt'],
    },
    {
      fate: 'rewrite',
      why: 'Prisma stamps every update.',
      columns: ['updatedAt'],
    },
    {
      fate: 'null',
      why: "The anonymised row must not carry a named minor's timeline.",
      columns: ONBOARDING_TIMELINE,
    },
    {
      fate: 'null',
      why: "The talent's own signature: its city, the règlement version and year.",
      columns: ['rulesSignedCity', 'reglementVersion', 'onboardingSchoolYear'],
    },
    {
      fate: 'null',
      why: 'Identity and profile.',
      columns: [
        'externalId',
        'phone',
        'civilite',
        'niveau',
        'schoolId',
        'highSchoolNameManual',
        'interestsFreeText',
        'setupDescription',
      ],
    },
    {
      fate: 'null',
      why: "The guardian's typed names and the PDF they signed.",
      columns: GUARDIAN_ACTS,
    },
    {
      fate: 'null',
      why: 'The legacy règlement PDF is deleted with the others, so its key goes too.',
      columns: ['rulesFilePath'],
    },
    {
      fate: 'null',
      why: 'The guardians are data subjects too.',
      columns: GUARDIAN_CONTACTS,
    },
    {
      fate: 'rewrite',
      why: 'The run of consecutive days feeds only their own badges: back to no run.',
      columns: ['streakDays'],
    },
    {
      fate: 'null',
      why: 'The day that run last grew, with it.',
      columns: ['streakLastDay'],
    },
  ],
};

const RESET: Policy = {
  tables: {
    TalentSfImport: {
      fate: 'keep',
      why: 'Worker-owned: the import the talent is reset to.',
    },
    Participation: {
      fate: 'keep',
      why: 'The enrolments the worker wrote are part of the import.',
    },
    Schooling_YearRecord: {
      fate: 'keep',
      why: 'Past years are import-derived history; only the current year is realigned to the mirror (a new row is allowed).',
    },
    Note_TalentNote: {
      fate: 'keep',
      why: 'Staff observations about the talent, not something the talent accrued; only an erasure removes them.',
    },
    AuthIdentityRepair: {
      fate: 'keep',
      why: 'An audit of how the login identity was repaired; the identity itself is kept.',
    },
    TalentDeletionRequest: {
      fate: 'keep',
      why: 'A pending request is a legal one that still has to be answered, and a fulfilled one the proof of erasure.',
    },
    Closing_Record: { fate: 'delete', why: 'Accrued after import.' },
    Closing_ResetEvent: {
      fate: 'delete',
      why: 'The trace of the closings it resets.',
    },
    TalentInterest: { fate: 'delete', why: 'Onboarding output.' },
    Onboarding_Record: {
      fate: 'delete',
      why: 'The dossier is the sign-up a reset voids; a current one left behind would be copied back onto the projection.',
    },
    OnboardingPdfJob: { fate: 'delete', why: 'Rendered after import.' },
    MinigameAttempt: { fate: 'delete', why: 'Played after import.' },
    Workshop_Participation: {
      fate: 'delete',
      why: 'A kept xpCelebrated outlives the XpGrant delete, so XP re-earned from zero would never float until they passed it.',
    },
    XpGrant: { fate: 'delete', why: 'Earned after import.' },
    EventPresence: {
      fate: 'delete',
      why: 'The source eventsCount projects from, zeroed with it so a later mark cannot resurrect it.',
    },
    ImageRightsDecisionRecord: { fate: 'delete', why: 'Decided after import.' },
    BroadcastRecipient: { fate: 'delete', why: 'Sent after import.' },
    Feedback_Submission: { fate: 'delete', why: 'Answered after import.' },
    SyncError: {
      fate: 'keep',
      why: 'An operations record about the Salesforce contact, which the reset keeps.',
    },
  },
  talent: [
    {
      fate: 'keep',
      why: 'The row, its Salesforce identity, its login link and its creation date: the import itself.',
      columns: ['id', 'externalId', 'userId', 'createdAt'],
    },
    {
      fate: 'keep',
      why: 'A privacy preference, and the erasure fact (a reset leaves it as it found it).',
      columns: ['usageAnalyticsOptOutAt', 'anonymizedAt'],
    },
    {
      fate: 'rewrite',
      why: "Re-seeded from the Salesforce mirror, as the worker's first import seeds them.",
      columns: ['nom', 'prenom', 'phone', 'civilite', 'niveau', 'schoolId'],
    },
    {
      fate: 'rewrite',
      why: 'The XP projections, zeroed with the ledger and the marks they project.',
      columns: ['xp', 'eventsCount'],
    },
    {
      fate: 'rewrite',
      why: 'Prisma stamps every update.',
      columns: ['updatedAt'],
    },
    {
      fate: 'null',
      why: 'A fresh import has never logged in.',
      columns: ['lastActiveAt', 'firstLoginAt'],
    },
    {
      fate: 'null',
      why: 'The onboarding the reset voids.',
      columns: ONBOARDING_TIMELINE,
    },
    {
      fate: 'null',
      why: "The talent's own signature: its city, the règlement version and year.",
      columns: ['rulesSignedCity', 'reglementVersion', 'onboardingSchoolYear'],
    },
    {
      fate: 'null',
      why: 'Onboarding answers.',
      columns: [
        'highSchoolNameManual',
        'interestsFreeText',
        'setupDescription',
      ],
    },
    {
      fate: 'null',
      why: "The guardian's acts, signed after import.",
      columns: GUARDIAN_ACTS,
    },
    {
      fate: 'null',
      why: 'The legacy règlement PDF is deleted with the others, so its key goes too.',
      columns: ['rulesFilePath'],
    },
    {
      fate: 'null',
      why: 'Guardians entered during onboarding.',
      columns: GUARDIAN_CONTACTS,
    },
    {
      fate: 'rewrite',
      why: 'A fresh import has never logged in, so it has no run of days: back to 0.',
      columns: ['streakDays'],
    },
    {
      fate: 'null',
      why: 'The day that run last grew, with it.',
      columns: ['streakLastDay'],
    },
  ],
};

type Datamodel = Awaited<ReturnType<typeof loadDatamodel>>;
type Row = Record<string, unknown>;

/** Every model that holds a talent's rows, with the columns that name the talent. */
function talentScopedModels(
  datamodel: Datamodel,
): Map<string, readonly TalentColumn[]> {
  const scoped = new Map<string, Set<string>>();
  const add = (model: string, column: string) =>
    scoped.set(model, (scoped.get(model) ?? new Set()).add(column));
  for (const model of datamodel.models) {
    if (model.name === 'Talent') continue;
    for (const field of model.fields) {
      if (field.kind === 'object' && field.type === 'Talent') {
        for (const column of field.relationFromFields ?? [])
          add(model.name, column);
      }
      if (field.kind === 'scalar' && /talentId$/i.test(field.name)) {
        add(model.name, field.name);
      }
    }
  }
  return new Map([
    ...[...scoped].map(([model, columns]): [string, TalentColumn[]] => [
      model,
      [...columns].map((column) => ({ column, holds: 'talentId' })),
    ]),
    ...Object.entries(BY_OTHER_IDENTITY),
  ]);
}

/** The Prisma delegate of a model, read generically. */
function delegate(model: string) {
  const name = model[0].toLowerCase() + model.slice(1);
  return (
    prisma as unknown as Record<
      string,
      { findMany: (args: unknown) => Promise<Row[]> }
    >
  )[name];
}

/** A row's primary key, as one string. */
function keyOf(datamodel: Datamodel, model: string, row: Row): string {
  const m = datamodel.models.find((x) => x.name === model)!;
  const fields =
    m.primaryKey?.fields ?? m.fields.filter((f) => f.isId).map((f) => f.name);
  return fields.map((f) => String(row[f])).join('|');
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

describe('what erasure and reset do to every talent table (integration)', () => {
  const stamp = Date.now();
  let datamodel: Datamodel;
  let scoped: Map<string, readonly TalentColumn[]>;
  const created = {
    campusId: '',
    eventId: '',
    schoolA: '',
    schoolB: '',
    closingTemplateId: '',
    formId: '',
    messageTemplateId: '',
    broadcastId: '',
    publicationId: '',
    instanceId: '',
    activityId: '',
    interestId: '',
  };
  const userIds: string[] = [];

  /**
   * A talent with every column filled and one row in every table that can hold
   * one of theirs, so a cleared column or a deleted row is something the
   * operation did rather than something that was never there.
   */
  async function seedTalentWithEveryRow(label: string) {
    const email = `${label}-${stamp}@scoped.test`;
    const externalId = `scoped-${label}-${stamp}`;
    const parentEmail = `${label}-parent-${stamp}@scoped.test`;
    const user = await prisma.bauth_user.create({
      data: {
        email,
        sessions: {
          create: {
            token: `${label}-session-${stamp}`,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        },
        accounts: {
          create: {
            accountId: `${label}-${stamp}`,
            providerId: 'test',
          },
        },
      },
    });
    const parent = await prisma.bauth_user.create({
      data: {
        email: parentEmail,
        role: 'parent',
        sessions: {
          create: {
            token: `${label}-parent-session-${stamp}`,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        },
      },
    });
    userIds.push(user.id, parent.id);

    const dossierKeys = {
      rules1: `${label}/2024/rules.pdf`,
      rights1: `${label}/2024/image-rights.pdf`,
      rules2: `${label}/2025/rules.pdf`,
      rights2: `${label}/2025/image-rights.pdf`,
    };
    const talentModel = datamodel.models.find((m) => m.name === 'Talent')!;
    const filled: Row = {};
    for (const field of talentModel.fields) {
      if (field.kind === 'object' || field.isId || field.isUpdatedAt) continue;
      if (field.name === 'createdAt') continue;
      if (field.kind === 'enum') {
        filled[field.name] = datamodel.enums.find(
          (e) => e.name === field.type,
        )!.values[0].name;
      } else if (field.type === 'String') {
        filled[field.name] = `${field.name}-${label}`;
      } else if (field.type === 'DateTime') {
        filled[field.name] = new Date('2026-01-15T10:00:00.000Z');
      } else if (field.type === 'Int') {
        filled[field.name] = 480;
      } else if (field.type === 'Boolean') {
        filled[field.name] = true;
      }
    }
    const talent = await prisma.talent.create({
      data: {
        ...(filled as Prisma.TalentUncheckedCreateInput),
        userId: user.id,
        schoolId: created.schoolA,
        externalId,
        parentEmail,
        parent2Email: `${label}-parent2-${stamp}@scoped.test`,
        // The same key as a dossier row's, which the collection deduplicates.
        imageRightsFilePath: dossierKeys.rights1,
        rulesFilePath: `${label}/legacy/rules.pdf`,
        anonymizedAt: null,
      },
    });
    const talentId = talent.id;
    const at = new Date('2026-01-15T10:00:00.000Z');

    await prisma.schooling_YearRecord.create({
      data: {
        talentId,
        schoolYear: '2024-2025',
        niveau: '2nde',
        schoolId: created.schoolA,
        source: 'sync',
      },
    });
    await prisma.onboarding_Record.createMany({
      data: [
        {
          talentId,
          schoolYear: '2024-2025',
          rulesFilePath: dossierKeys.rules1,
          imageRightsFilePath: dossierKeys.rights1,
        },
        {
          talentId,
          schoolYear: '2025-2026',
          rulesFilePath: dossierKeys.rules2,
          imageRightsFilePath: dossierKeys.rights2,
        },
      ],
    });
    await prisma.talentSfImport.create({
      data: {
        talentId,
        nom: 'Salesforce',
        prenom: 'Importée',
        sfEmail: email,
        phone: '+33611111111',
        civilite: 'homme',
        niveau: '1ere',
        sfSchoolId: created.schoolB,
      },
    });
    await prisma.imageRightsDecisionRecord.create({
      data: {
        talentId,
        decision: 'accepted',
        schoolYear: '2025-2026',
        decidedAt: at,
        signerPrenom: 'Parent',
        signerNom: label,
      },
    });
    await prisma.talentDeletionRequest.create({
      data: { talentId, reason: 'Je ne viens plus', resolutionNote: 'Vu' },
    });
    await prisma.note_TalentNote.create({
      data: { talentId, body: 'Arrivé en retard' },
    });
    await prisma.participation.create({
      data: {
        talentId,
        eventId: created.eventId,
        campusId: created.campusId,
      },
    });
    await prisma.eventPresence.create({
      data: {
        talentId,
        eventId: created.eventId,
        day: new Date('2026-01-15T00:00:00.000Z'),
        slot: 'morning',
        status: 'present',
      },
    });
    await prisma.feedback_Submission.create({
      data: { formId: created.formId, source: 'authenticated', talentId },
    });
    await prisma.closing_Record.create({
      data: {
        talentId,
        eventId: created.eventId,
        campusId: created.campusId,
        templateId: created.closingTemplateId,
      },
    });
    await prisma.closing_ResetEvent.create({
      data: { talentId, conductedAt: at, reason: 'Repris à zéro' },
    });
    await prisma.onboardingPdfJob.create({
      data: { talentId, documentType: 'rules', schoolYear: '2025-2026' },
    });
    await prisma.broadcastRecipient.createMany({
      data: [
        { broadcastId: created.broadcastId, talentId },
        { broadcastId: created.broadcastId, parentOfTalentId: talentId },
      ],
    });
    await prisma.talentInterest.create({
      data: { talentId, interestId: created.interestId },
    });
    await prisma.minigameAttempt.create({
      data: {
        talentId,
        publicationId: created.publicationId,
        jti: `${label}-${stamp}`,
      },
    });
    await prisma.xpGrant.create({
      data: {
        talentId,
        source: 'admin_adjustment',
        sourceId: `${label}-${stamp}`,
        amount: 480,
      },
    });
    await prisma.workshop_Participation.create({
      data: {
        talentId,
        activityId: created.activityId,
        eventId: created.eventId,
        campusId: created.campusId,
        xpCelebrated: 480,
      },
    });
    await prisma.syncError.createMany({
      data: [
        {
          errorType: 'DUPLICATE_EMAIL',
          email,
          attemptedExtId: externalId,
          talentName: `Talent ${label}`,
          message: 'Adresse déjà prise.',
        },
        {
          errorType: 'DUPLICATE_EMAIL',
          email: `${label}-other-${stamp}@scoped.test`,
          attemptedExtId: `other-${label}-${stamp}`,
          existingExtId: externalId,
          talentName: 'Autre talent',
          message: 'Adresse déjà prise.',
        },
        // Another contact claiming this talent's address: the row names them by
        // the address, and its message by their Salesforce id.
        {
          errorType: 'DUPLICATE_EMAIL',
          email,
          attemptedExtId: `claimant-${label}-${stamp}`,
          talentName: 'Autre contact',
          message: `L'adresse du talent est déjà utilisée par le talent externalId="${externalId}".`,
        },
      ],
    });
    await prisma.authIdentityRepair.create({
      data: {
        talentId,
        kind: 'repoint',
        resolvedBy: 'test',
        fromEmail: `${label}-from@scoped.test`,
        toEmail: email,
      },
    });

    return {
      talentId,
      externalId,
      userId: user.id,
      parentUserId: parent.id,
      email,
      documentKeys: [
        `${label}/legacy/rules.pdf`,
        ...Object.values(dossierKeys),
      ].sort(),
    };
  }

  /** Every row of a talent, per scoped table, keyed by primary key. */
  async function rowsOf(talent: Record<Identity, string>) {
    const rows = new Map<string, Map<string, Row>>();
    for (const [model, columns] of scoped) {
      const found = await delegate(model).findMany({
        where: {
          OR: columns.map(({ column, holds }) => ({
            [column]: talent[holds],
          })),
        },
      });
      rows.set(
        model,
        new Map(found.map((row) => [keyOf(datamodel, model, row), row])),
      );
    }
    return rows;
  }

  /** What an operation did, against what its policy says it does. */
  function tableProblems(
    policy: Policy,
    before: Map<string, Map<string, Row>>,
    after: Map<string, Map<string, Row>>,
  ): string[] {
    const problems: string[] = [];
    for (const [model, fate] of Object.entries(policy.tables) as [
      string,
      TableFate,
    ][]) {
      const was = before.get(model) ?? new Map();
      const is = after.get(model) ?? new Map();
      for (const [key, row] of was) {
        const now = is.get(key);
        if (fate.fate === 'delete' && now) {
          problems.push(`${model} ${key}: declared delete, still there.`);
        }
        if (fate.fate === 'keep' && !same(now, row)) {
          problems.push(
            `${model} ${key}: declared keep, ${now ? 'changed' : 'gone'}.`,
          );
        }
        if (fate.fate === 'scrub') {
          if (!now) {
            problems.push(`${model} ${key}: declared scrub, gone.`);
            continue;
          }
          for (const column of Object.keys(row)) {
            const scrubbed = fate.columns.includes(column);
            if (scrubbed === same(now[column], row[column])) {
              problems.push(
                `${model}.${column}: declared ${scrubbed ? 'scrubbed' : 'left as is'}, ${scrubbed ? 'unchanged' : 'changed'}.`,
              );
            }
          }
        }
      }
    }
    return problems;
  }

  function columnProblems(policy: Policy, before: Row, after: Row): string[] {
    const problems: string[] = [];
    for (const group of policy.talent) {
      for (const column of group.columns) {
        const was = before[column];
        const is = after[column];
        const ok =
          group.fate === 'keep'
            ? same(is, was)
            : group.fate === 'null'
              ? is === null
              : is !== null && !same(is, was);
        if (!ok) {
          problems.push(
            `Talent.${column}: declared ${group.fate}, was ${JSON.stringify(was)}, now ${JSON.stringify(is)}.`,
          );
        }
      }
    }
    return problems;
  }

  /** Whether a policy classifies exactly the tables and columns the schema has. */
  function classificationProblems(name: string, policy: Policy): string[] {
    const problems: string[] = [];
    for (const [model, columns] of scoped) {
      if (!policy.tables[model as Prisma.ModelName]) {
        problems.push(
          `${model} holds talent rows through ${columns.map((c) => c.column).join(', ')}: say in ${name}.tables what ${name.toLowerCase()} does to them (delete, keep or scrub) and why.`,
        );
      }
    }
    for (const model of Object.keys(policy.tables)) {
      if (!scoped.has(model)) {
        problems.push(
          `${name}.tables names ${model}, which holds no talent rows any more: delete the entry.`,
        );
      }
    }
    const talentColumns = datamodel.models
      .find((m) => m.name === 'Talent')!
      .fields.filter((f) => f.kind !== 'object')
      .map((f) => f.name);
    const classified = policy.talent.flatMap((g) => [...g.columns]);
    for (const column of talentColumns) {
      const count = classified.filter((c) => c === column).length;
      if (count === 0) {
        problems.push(
          `Talent.${column} has no fate under ${name.toLowerCase()}: add it to a group of ${name}.talent.`,
        );
      }
      if (count > 1) {
        problems.push(
          `Talent.${column} sits in ${count} groups of ${name}.talent.`,
        );
      }
    }
    for (const column of classified) {
      if (!talentColumns.includes(column)) {
        problems.push(
          `${name}.talent names Talent.${column}, which no longer exists.`,
        );
      }
    }
    return problems;
  }

  function fixtureProblems(
    rows: Map<string, Map<string, Row>>,
    talent: Record<Identity, string>,
  ): string[] {
    const problems: string[] = [];
    for (const [model, columns] of scoped) {
      const found = [...(rows.get(model)?.values() ?? [])];
      for (const { column, holds } of columns) {
        if (!found.some((row) => row[column] === talent[holds])) {
          problems.push(
            `${model}.${column} has no fixture row, so this suite cannot see what is done to it: seed one in seedTalentWithEveryRow.`,
          );
        }
      }
    }
    return problems;
  }

  type Run = {
    seeded: Awaited<ReturnType<typeof seedTalentWithEveryRow>>;
    before: Map<string, Map<string, Row>>;
    after: Map<string, Map<string, Row>>;
    talentBefore: Row;
    talentAfter: Row;
  };
  let erasure: Run;
  let reset: Run;
  let erasureKeys: string[] = [];
  let publicBilanId = '';

  beforeAll(async () => {
    assertTestDatabase();
    datamodel = await loadDatamodel();
    scoped = talentScopedModels(datamodel);

    const campus = await prisma.campus.create({
      data: { name: `Scoped Campus ${stamp}` },
    });
    created.campusId = campus.id;
    created.eventId = (
      await prisma.event.create({
        data: {
          titre: 'Scoped Event',
          campusId: campus.id,
          date: new Date('2026-01-15T09:00:00.000Z'),
        },
      })
    ).id;
    created.schoolA = (
      await prisma.school.create({
        data: { uai: `SCA${stamp}`, name: 'Lycée A', resolvedAt: new Date() },
      })
    ).id;
    created.schoolB = (
      await prisma.school.create({
        data: { uai: `SCB${stamp}`, name: 'Lycée B', resolvedAt: new Date() },
      })
    ).id;
    created.closingTemplateId = (
      await prisma.closing_Template.create({
        data: { key: `scoped-${stamp}`, label: 'Grille' },
      })
    ).id;
    created.formId = (
      await prisma.feedback_Form.create({
        data: { slug: `scoped-${stamp}`, title: 'Bilan' },
      })
    ).id;
    created.messageTemplateId = (
      await prisma.messageTemplate.create({
        data: { name: `Scoped ${stamp}`, channel: 'mail', body: 'Bonjour' },
      })
    ).id;
    created.broadcastId = (
      await prisma.broadcast.create({
        data: {
          name: `Scoped ${stamp}`,
          channel: 'mail',
          templateId: created.messageTemplateId,
          campusId: campus.id,
          audience: 'talent',
          bodySnapshot: 'Bonjour',
        },
      })
    ).id;
    created.publicationId = (
      await prisma.minigamePublication.create({
        data: {
          game: `scoped-${stamp}`,
          gameName: 'Jeu',
          level: 1,
          scoringType: 'score',
        },
      })
    ).id;
    created.instanceId = (
      await prisma.workshop_Instance.create({
        data: {
          slug: `scoped-${stamp}`,
          baseUrl: 'https://scoped.ctfd.invalid',
        },
      })
    ).id;
    created.activityId = (
      await prisma.workshop_Activity.create({
        data: {
          slug: `scoped-activity-${stamp}`,
          instanceId: created.instanceId,
          label: 'Atelier',
        },
      })
    ).id;
    created.interestId = (
      await prisma.interest.create({
        data: { nom: `Scoped ${stamp}`, order: 999 },
      })
    ).id;

    // Erasure, run as both of its callers run it: inside a transaction.
    {
      const seeded = await seedTalentWithEveryRow('erase');
      // A public bilan typed with the talent's address in another case: no
      // talentId, so only the address ties it to them.
      publicBilanId = (
        await prisma.feedback_Submission.create({
          data: {
            formId: created.formId,
            source: 'public',
            respondentEmail: seeded.email.toUpperCase(),
          },
        })
      ).id;
      const before = await rowsOf(seeded);
      const talentBefore = await prisma.talent.findUniqueOrThrow({
        where: { id: seeded.talentId },
      });
      erasureKeys = await prisma.$transaction((tx) =>
        anonymizeTalent(tx, seeded.talentId),
      );
      erasure = {
        seeded,
        before,
        after: await rowsOf(seeded),
        talentBefore,
        talentAfter: await prisma.talent.findUniqueOrThrow({
          where: { id: seeded.talentId },
        }),
      };
    }

    {
      const seeded = await seedTalentWithEveryRow('reset');
      const before = await rowsOf(seeded);
      const talentBefore = await prisma.talent.findUniqueOrThrow({
        where: { id: seeded.talentId },
      });
      deletedObjects.length = 0;
      await resetTalentToImport(seeded.talentId);
      reset = {
        seeded,
        before,
        after: await rowsOf(seeded),
        talentBefore,
        talentAfter: await prisma.talent.findUniqueOrThrow({
          where: { id: seeded.talentId },
        }),
      };
    }
  });

  afterAll(async () => {
    const talents = [erasure?.seeded.talentId, reset?.seeded.talentId].filter(
      Boolean,
    ) as string[];
    await prisma.authIdentityRepair.deleteMany({
      where: { talentId: { in: talents } },
    });
    const seededRuns = [erasure?.seeded, reset?.seeded].filter(
      (seeded) => seeded !== undefined,
    );
    await prisma.syncError.deleteMany({
      where: {
        OR: [
          { attemptedExtId: { in: seededRuns.map((r) => r.externalId) } },
          { existingExtId: { in: seededRuns.map((r) => r.externalId) } },
          { email: { in: seededRuns.map((r) => r.email) } },
        ],
      },
    });
    await prisma.broadcastRecipient.deleteMany({
      where: { broadcastId: created.broadcastId },
    });
    await prisma.feedback_Submission.deleteMany({
      where: { formId: created.formId },
    });
    await prisma.talent.deleteMany({ where: { id: { in: talents } } });
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.event.deleteMany({ where: { id: created.eventId } });
    await prisma.broadcast.deleteMany({ where: { id: created.broadcastId } });
    await prisma.messageTemplate.deleteMany({
      where: { id: created.messageTemplateId },
    });
    await prisma.workshop_Activity.deleteMany({
      where: { id: created.activityId },
    });
    await prisma.workshop_Instance.deleteMany({
      where: { id: created.instanceId },
    });
    await prisma.minigamePublication.deleteMany({
      where: { id: created.publicationId },
    });
    await prisma.interest.deleteMany({ where: { id: created.interestId } });
    await prisma.feedback_Form.deleteMany({ where: { id: created.formId } });
    await prisma.closing_Template.deleteMany({
      where: { id: created.closingTemplateId },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [created.schoolA, created.schoolB] } },
    });
    await prisma.campus.deleteMany({ where: { id: created.campusId } });
  });

  describe('the erasure', () => {
    it('classifies every talent-scoped table and every Talent column', () => {
      expect(classificationProblems('ERASURE', ERASURE)).toEqual([]);
      expect(fixtureProblems(erasure.before, erasure.seeded)).toEqual([]);
    });

    it('does to each table what its classification says', () => {
      expect(tableProblems(ERASURE, erasure.before, erasure.after)).toEqual([]);
    });

    it('does to each Talent column what its classification says', () => {
      expect(
        columnProblems(ERASURE, erasure.talentBefore, erasure.talentAfter),
      ).toEqual([]);
    });

    it("scrubs the talent's and the guardian's logins and closes their sessions", async () => {
      const { userId, parentUserId, talentId } = erasure.seeded;
      expect(
        await prisma.bauth_user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        }),
      ).toEqual({
        email: `anonymized-${talentId}@jump.internal`,
        name: 'Utilisateur Anonymisé',
      });
      expect(
        await prisma.bauth_user.findUnique({
          where: { id: parentUserId },
          select: { email: true, name: true },
        }),
      ).toEqual({
        email: `anonymized-parent-${parentUserId}@jump.internal`,
        name: 'Parent Anonymisé',
      });
      expect(
        await prisma.bauth_session.count({
          where: { userId: { in: [userId, parentUserId] } },
        }),
      ).toBe(0);
      expect(await prisma.bauth_account.count({ where: { userId } })).toBe(0);
    });

    it('hands back every onboarding PDF key once, for deletion after commit', () => {
      expect([...erasureKeys].sort()).toEqual(erasure.seeded.documentKeys);
    });

    it("erases a public bilan typed with the talent's address", async () => {
      expect(
        await prisma.feedback_Submission.findUnique({
          where: { id: publicBilanId },
        }),
      ).toBeNull();
    });
  });

  describe('the reset to import', () => {
    it('classifies every talent-scoped table and every Talent column', () => {
      expect(classificationProblems('RESET', RESET)).toEqual([]);
      expect(fixtureProblems(reset.before, reset.seeded)).toEqual([]);
    });

    it('does to each table what its classification says', () => {
      expect(tableProblems(RESET, reset.before, reset.after)).toEqual([]);
    });

    it('does to each Talent column what its classification says', () => {
      expect(
        columnProblems(RESET, reset.talentBefore, reset.talentAfter),
      ).toEqual([]);
    });

    it("keeps the talent's login, closes its sessions and deletes a test guardian's", async () => {
      const { userId, parentUserId, email } = reset.seeded;
      expect(
        await prisma.bauth_user.findUnique({
          where: { id: userId },
          select: { email: true },
        }),
      ).toEqual({ email });
      expect(await prisma.bauth_session.count({ where: { userId } })).toBe(0);
      expect(await prisma.bauth_account.count({ where: { userId } })).toBe(0);
      expect(
        await prisma.bauth_user.findUnique({ where: { id: parentUserId } }),
      ).toBeNull();
    });

    it('deletes every onboarding PDF once the reset has committed', () => {
      expect([...deletedObjects].sort()).toEqual(reset.seeded.documentKeys);
    });

    // An erased talent has no import to return to (the erasure deleted the
    // mirror), and a reset would re-create a schooling row and wipe what the
    // erasure kept, so it is refused before anything is written.
    it('refuses an erased talent and changes nothing', async () => {
      const { talentId } = erasure.seeded;
      await expect(resetTalentToImport(talentId)).rejects.toBeInstanceOf(
        TalentAlreadyErased,
      );
      expect(await rowsOf(erasure.seeded)).toEqual(erasure.after);
      expect(
        await prisma.talent.findUniqueOrThrow({ where: { id: talentId } }),
      ).toEqual(erasure.talentAfter);
    });
  });
});
