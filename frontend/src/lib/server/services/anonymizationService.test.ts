import { describe, it, expect, vi } from 'vitest';
import { anonymizeTalent } from './anonymizationService';
import type { Prisma } from '@prisma/client';

describe('anonymizationService - anonymizeTalent', () => {
  it('scrubs AuthIdentityRepair emails and TalentDeletionRequest free text fields during anonymization', async () => {
    const mockTalent = {
      userId: 'user_123',
      user: { email: 'student@example.test' },
      parentEmail: 'parent@example.test',
      parent2Email: null,
      rulesFilePath: null,
      imageRightsFilePath: null,
    };

    const mockTx = {
      talent: {
        findUnique: vi.fn().mockResolvedValue(mockTalent),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      talentSfImport: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      talentInterest: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      schooling_YearRecord: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      imageRightsDecisionRecord: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      note_TalentNote: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      feedback_Submission: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      interview: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      interviewReset: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      onboardingPdfJob: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      broadcastRecipient: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      authIdentityRepair: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      talentDeletionRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      bauth_user: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      bauth_session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      bauth_account: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as Prisma.TransactionClient;

    await anonymizeTalent(mockTx, 'talent_123');

    // Assert AuthIdentityRepair email scrubbing
    expect(mockTx.authIdentityRepair.updateMany).toHaveBeenCalledWith({
      where: { talentId: 'talent_123' },
      data: {
        fromEmail: 'anonyme@anonyme.invalid',
        toEmail: 'anonyme@anonyme.invalid',
      },
    });

    // Assert TalentDeletionRequest free-text scrubbing
    expect(mockTx.talentDeletionRequest.updateMany).toHaveBeenCalledWith({
      where: { talentId: 'talent_123' },
      data: {
        reason: null,
        resolutionNote: null,
      },
    });
  });
});
