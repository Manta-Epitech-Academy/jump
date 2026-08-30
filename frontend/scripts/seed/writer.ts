/**
 * How rows reach the database.
 *
 * Scenarios never call Prisma. They push plain row payloads into this buffer and
 * the runner flushes it once, in foreign-key order, with `createMany`. Two
 * things follow, and both are the reason for the indirection.
 *
 * It is fast enough to matter. The staging profile writes tens of thousands of
 * presence cells; done row by row that is minutes, and a reset nobody waits for
 * is a reset nobody uses - which would take the PO's reset button with it.
 *
 * And it makes the write order one decision in one place instead of an ordering
 * every scenario has to get right on its own.
 *
 * The services are deliberately not used. They all reach `$lib/server/db`, which
 * reads `$env/dynamic/private` and does not resolve outside Vite, and calling
 * them one row at a time would be far slower besides. What the app's own logic
 * does instead is CHECK the result: see `assert/`. The generator constructs, the
 * domain verifies.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { SEED_ID_PREFIX } from './ids';

/**
 * One array per model, flushed in this declaration order.
 *
 * Two things are load-bearing about the keys. The order IS the foreign-key
 * order: a model may only depend on models declared above it. And each key is
 * the Prisma delegate name EXACTLY - `bauth_user`, not `bauthUser` - because the
 * flush looks the delegate up by key. Prisma's delegate name is not derivable
 * from the model name (`Closing_Record` becomes `closing_Record`, `bauth_user`
 * stays as it is), so any mapping in between would be a table somebody has to
 * keep in step. Making the key the name removes the table.
 */
export type Buffered = {
  campus: Prisma.CampusCreateManyInput[];
  school: Prisma.SchoolCreateManyInput[];
  bauth_user: Prisma.bauth_userCreateManyInput[];
  staffProfile: Prisma.StaffProfileCreateManyInput[];
  signatory: Prisma.SignatoryCreateManyInput[];
  staffInvitation: Prisma.StaffInvitationCreateManyInput[];
  adminApi_Token: Prisma.AdminApi_TokenCreateManyInput[];
  adminApi_Call: Prisma.AdminApi_CallCreateManyInput[];
  messageTemplate: Prisma.MessageTemplateCreateManyInput[];
  emailActionMapping: Prisma.EmailActionMappingCreateManyInput[];
  talent: Prisma.TalentCreateManyInput[];
  talentSfImport: Prisma.TalentSfImportCreateManyInput[];
  schooling_YearRecord: Prisma.Schooling_YearRecordCreateManyInput[];
  onboarding_Record: Prisma.Onboarding_RecordCreateManyInput[];
  imageRightsDecisionRecord: Prisma.ImageRightsDecisionRecordCreateManyInput[];
  onboardingPdfJob: Prisma.OnboardingPdfJobCreateManyInput[];
  talentInterest: Prisma.TalentInterestCreateManyInput[];
  talentDeletionRequest: Prisma.TalentDeletionRequestCreateManyInput[];
  closing_Question: Prisma.Closing_QuestionCreateManyInput[];
  closing_Option: Prisma.Closing_OptionCreateManyInput[];
  closing_Template: Prisma.Closing_TemplateCreateManyInput[];
  closing_TemplateSection: Prisma.Closing_TemplateSectionCreateManyInput[];
  closing_TemplateQuestion: Prisma.Closing_TemplateQuestionCreateManyInput[];
  eventConfig_Template: Prisma.EventConfig_TemplateCreateManyInput[];
  eventConfig_TemplateModule: Prisma.EventConfig_TemplateModuleCreateManyInput[];
  event: Prisma.EventCreateManyInput[];
  eventConfig_Module: Prisma.EventConfig_ModuleCreateManyInput[];
  participation: Prisma.ParticipationCreateManyInput[];
  planning_Slot: Prisma.Planning_SlotCreateManyInput[];
  eventPresence: Prisma.EventPresenceCreateManyInput[];
  eventPresenceClosure: Prisma.EventPresenceClosureCreateManyInput[];
  closing_Record: Prisma.Closing_RecordCreateManyInput[];
  closing_Answer: Prisma.Closing_AnswerCreateManyInput[];
  closing_AnswerOption: Prisma.Closing_AnswerOptionCreateManyInput[];
  closing_ResetEvent: Prisma.Closing_ResetEventCreateManyInput[];
  xpReward: Prisma.XpRewardCreateManyInput[];
  xpGrant: Prisma.XpGrantCreateManyInput[];
  minigamePublication: Prisma.MinigamePublicationCreateManyInput[];
  minigameAttempt: Prisma.MinigameAttemptCreateManyInput[];
  note_TalentNote: Prisma.Note_TalentNoteCreateManyInput[];
  feedback_Submission: Prisma.Feedback_SubmissionCreateManyInput[];
  feedback_Answer: Prisma.Feedback_AnswerCreateManyInput[];
  feedback_AnswerOption: Prisma.Feedback_AnswerOptionCreateManyInput[];
  broadcast: Prisma.BroadcastCreateManyInput[];
  broadcastRecipient: Prisma.BroadcastRecipientCreateManyInput[];
  syncError: Prisma.SyncErrorCreateManyInput[];
  usage_FeatureUse: Prisma.Usage_FeatureUseCreateManyInput[];
  authIdentityRepair: Prisma.AuthIdentityRepairCreateManyInput[];
};

const MODEL_ORDER = [
  'campus',
  'school',
  'bauth_user',
  'staffProfile',
  'signatory',
  'staffInvitation',
  'adminApi_Token',
  'adminApi_Call',
  'messageTemplate',
  'emailActionMapping',
  'talent',
  'talentSfImport',
  'schooling_YearRecord',
  'onboarding_Record',
  'imageRightsDecisionRecord',
  'onboardingPdfJob',
  'talentInterest',
  'talentDeletionRequest',
  'closing_Question',
  'closing_Option',
  'closing_Template',
  'closing_TemplateSection',
  'closing_TemplateQuestion',
  'eventConfig_Template',
  'eventConfig_TemplateModule',
  'event',
  'eventConfig_Module',
  'participation',
  'planning_Slot',
  'eventPresence',
  'eventPresenceClosure',
  'closing_Record',
  'closing_Answer',
  'closing_AnswerOption',
  'closing_ResetEvent',
  'xpReward',
  'xpGrant',
  'minigamePublication',
  'minigameAttempt',
  'note_TalentNote',
  'feedback_Submission',
  'feedback_Answer',
  'feedback_AnswerOption',
  'broadcast',
  'broadcastRecipient',
  'syncError',
  'usage_FeatureUse',
  'authIdentityRepair',
] as const satisfies readonly (keyof Buffered)[];

/** Postgres caps a statement's parameters, so long arrays go in slices. */
const CHUNK = 1000;

export function createBuffer(): Buffered {
  return Object.fromEntries(
    MODEL_ORDER.map((key) => [key, []]),
  ) as unknown as Buffered;
}

export async function flush(
  prisma: PrismaClient,
  buffer: Buffered,
  log: (message: string) => void,
): Promise<number> {
  let total = 0;
  for (const key of MODEL_ORDER) {
    const rows = buffer[key];
    if (rows.length === 0) continue;
    const delegate = prisma[key as keyof PrismaClient] as unknown as {
      createMany(args: { data: unknown[] }): Promise<{ count: number }>;
    };
    for (let i = 0; i < rows.length; i += CHUNK) {
      await delegate.createMany({ data: rows.slice(i, i + CHUNK) });
    }
    log(`  ${key.padEnd(28)} ${String(rows.length).padStart(7)}`);
    total += rows.length;
  }
  return total;
}

/**
 * Removes what this generator previously wrote, and nothing else.
 *
 * It matches on the `sd_` id prefix rather than truncating, which is not
 * fastidiousness. Migrations insert rows that no later run restores: the closing
 * question bank, the stage grid, the diploma templates. `migrate deploy` will not
 * put them back, because from its point of view the migration already ran. A
 * truncate would therefore destroy them permanently and the first symptom would
 * be a closing screen with no questions on it.
 *
 * Deleting explicitly rather than leaning on cascade, in reverse dependency
 * order, for the same reason the flush declares its order: so it is one decision
 * in one place, and so a relation whose `onDelete` changes cannot silently start
 * leaving rows behind.
 */
export async function wipe(
  prisma: PrismaClient,
  log: (message: string) => void,
  /**
   * Catalogue rows the generator owns but that carry their own natural keys
   * rather than seed ids - the feedback forms, keyed on a slug. Their seeder is
   * create-only, which is right for `--catalog-only` against a live database and
   * wrong for a full generation: without this, an edit to a fixture would never
   * reach a database that had already been seeded once, and the fixture and the
   * data would drift apart silently.
   */
  catalogueFormSlugs: readonly string[] = [],
): Promise<number> {
  const seeded = { startsWith: SEED_ID_PREFIX };
  let removed = 0;
  const drop = async (label: string, run: () => Promise<{ count: number }>) => {
    const { count } = await run();
    if (count > 0) log(`  - ${label.padEnd(28)} ${String(count).padStart(7)}`);
    removed += count;
  };

  await drop('authIdentityRepair', () =>
    prisma.authIdentityRepair.deleteMany({ where: { id: seeded } }),
  );
  await drop('usage_FeatureUse', () =>
    prisma.usage_FeatureUse.deleteMany({ where: { id: seeded } }),
  );
  await drop('syncError', () =>
    prisma.syncError.deleteMany({ where: { id: seeded } }),
  );
  await drop('broadcastRecipient', () =>
    prisma.broadcastRecipient.deleteMany({ where: { id: seeded } }),
  );
  await drop('broadcast', () =>
    prisma.broadcast.deleteMany({ where: { id: seeded } }),
  );
  await drop('feedback_AnswerOption', () =>
    prisma.feedback_AnswerOption.deleteMany({
      where: { answer: { id: seeded } },
    }),
  );
  await drop('feedback_Answer', () =>
    prisma.feedback_Answer.deleteMany({ where: { id: seeded } }),
  );
  await drop('feedback_Submission', () =>
    prisma.feedback_Submission.deleteMany({ where: { id: seeded } }),
  );
  await drop('note_TalentNote', () =>
    prisma.note_TalentNote.deleteMany({ where: { id: seeded } }),
  );
  await drop('minigameAttempt', () =>
    prisma.minigameAttempt.deleteMany({ where: { id: seeded } }),
  );
  await drop('minigamePublication', () =>
    prisma.minigamePublication.deleteMany({ where: { id: seeded } }),
  );
  await drop('xpGrant', () =>
    prisma.xpGrant.deleteMany({ where: { id: seeded } }),
  );
  await drop('xpReward', () =>
    prisma.xpReward.deleteMany({ where: { id: seeded } }),
  );
  await drop('closing_ResetEvent', () =>
    prisma.closing_ResetEvent.deleteMany({ where: { id: seeded } }),
  );
  await drop('closing_AnswerOption', () =>
    prisma.closing_AnswerOption.deleteMany({
      where: { answer: { id: seeded } },
    }),
  );
  await drop('closing_Answer', () =>
    prisma.closing_Answer.deleteMany({ where: { id: seeded } }),
  );
  await drop('closing_Record', () =>
    prisma.closing_Record.deleteMany({ where: { id: seeded } }),
  );
  await drop('eventPresenceClosure', () =>
    prisma.eventPresenceClosure.deleteMany({ where: { id: seeded } }),
  );
  await drop('eventPresence', () =>
    prisma.eventPresence.deleteMany({ where: { id: seeded } }),
  );
  await drop('planning_Slot', () =>
    prisma.planning_Slot.deleteMany({ where: { id: seeded } }),
  );
  await drop('participation', () =>
    prisma.participation.deleteMany({ where: { id: seeded } }),
  );
  await drop('eventConfig_Module', () =>
    prisma.eventConfig_Module.deleteMany({ where: { eventId: seeded } }),
  );
  await drop('event', () => prisma.event.deleteMany({ where: { id: seeded } }));
  await drop('eventConfig_TemplateModule', () =>
    prisma.eventConfig_TemplateModule.deleteMany({
      where: { templateId: seeded },
    }),
  );
  await drop('eventConfig_Template', () =>
    prisma.eventConfig_Template.deleteMany({ where: { id: seeded } }),
  );
  await drop('closing_TemplateQuestion', () =>
    prisma.closing_TemplateQuestion.deleteMany({ where: { id: seeded } }),
  );
  await drop('closing_TemplateSection', () =>
    prisma.closing_TemplateSection.deleteMany({ where: { id: seeded } }),
  );
  await drop('closing_Template', () =>
    prisma.closing_Template.deleteMany({ where: { id: seeded } }),
  );
  await drop('closing_Option', () =>
    prisma.closing_Option.deleteMany({ where: { id: seeded } }),
  );
  await drop('closing_Question', () =>
    prisma.closing_Question.deleteMany({ where: { id: seeded } }),
  );
  await drop('talentDeletionRequest', () =>
    prisma.talentDeletionRequest.deleteMany({ where: { id: seeded } }),
  );
  await drop('talentInterest', () =>
    prisma.talentInterest.deleteMany({ where: { talentId: seeded } }),
  );
  await drop('onboardingPdfJob', () =>
    prisma.onboardingPdfJob.deleteMany({ where: { id: seeded } }),
  );
  await drop('imageRightsDecisionRecord', () =>
    prisma.imageRightsDecisionRecord.deleteMany({ where: { id: seeded } }),
  );
  await drop('onboarding_Record', () =>
    prisma.onboarding_Record.deleteMany({ where: { id: seeded } }),
  );
  await drop('schooling_YearRecord', () =>
    prisma.schooling_YearRecord.deleteMany({ where: { id: seeded } }),
  );
  await drop('talentSfImport', () =>
    prisma.talentSfImport.deleteMany({ where: { talentId: seeded } }),
  );
  await drop('talent', () =>
    prisma.talent.deleteMany({ where: { id: seeded } }),
  );
  await drop('emailActionMapping', () =>
    prisma.emailActionMapping.deleteMany({ where: { templateId: seeded } }),
  );
  await drop('messageTemplate', () =>
    prisma.messageTemplate.deleteMany({ where: { id: seeded } }),
  );
  await drop('adminApi_Call', () =>
    prisma.adminApi_Call.deleteMany({ where: { id: seeded } }),
  );
  await drop('adminApi_Token', () =>
    prisma.adminApi_Token.deleteMany({ where: { id: seeded } }),
  );
  await drop('staffInvitation', () =>
    prisma.staffInvitation.deleteMany({ where: { id: seeded } }),
  );
  await drop('signatory', () =>
    prisma.signatory.deleteMany({ where: { id: seeded } }),
  );
  await drop('staffProfile', () =>
    prisma.staffProfile.deleteMany({ where: { id: seeded } }),
  );
  await drop('bauth_user', () =>
    prisma.bauth_user.deleteMany({ where: { id: seeded } }),
  );
  await drop('school', () =>
    prisma.school.deleteMany({ where: { id: seeded } }),
  );
  if (catalogueFormSlugs.length > 0) {
    await drop('feedback_Form', () =>
      prisma.feedback_Form.deleteMany({
        where: { slug: { in: [...catalogueFormSlugs] } },
      }),
    );
  }
  await drop('campus', () =>
    prisma.campus.deleteMany({ where: { id: seeded } }),
  );

  return removed;
}
