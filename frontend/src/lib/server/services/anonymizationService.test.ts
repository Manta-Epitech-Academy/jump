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
      // The two retired per-talent columns, each still holding the pre-annual key
      // of a document that has since been regenerated under a year-keyed one. No
      // dossier row points at either any more, so only these reads reach them.
      imageRightsFilePath: 'documents/talent_123/image-rights.pdf',
      rulesFilePath: 'documents/talent_123/rules.pdf',
      // Two years of dossier, each carrying BOTH renders. A talent who came back
      // has one règlement and one droit-à-l'image per school year, each at its
      // own key, and erasure has to return every one: the dossier rows are
      // deleted here, so a key left behind is a named minor's signed PDF
      // orphaned in the bucket.
      onboardingRecords: [
        {
          rulesFilePath: 'documents/talent_123/rules-2025-2026.pdf',
          imageRightsFilePath:
            'documents/talent_123/image-rights-2025-2026.pdf',
        },
        {
          rulesFilePath: 'documents/talent_123/rules-2026-2027.pdf',
          imageRightsFilePath:
            'documents/talent_123/image-rights-2026-2027.pdf',
        },
      ],
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
      onboarding_Record: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      imageRightsDecisionRecord: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      note_TalentNote: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      feedback_Submission: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      closing_Record: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      closing_ResetEvent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
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

    const documentKeys = await anonymizeTalent(mockTx, 'talent_123');

    // Every generated PDF is handed back for post-commit deletion: both years,
    // both kinds, plus the two retired keys. Returning only the latest would
    // leave the earlier year's documents in storage after an erasure reported
    // success, which is the erasure failing quietly.
    expect(documentKeys).toEqual(
      expect.arrayContaining([
        'documents/talent_123/image-rights.pdf',
        'documents/talent_123/rules.pdf',
        'documents/talent_123/rules-2025-2026.pdf',
        'documents/talent_123/rules-2026-2027.pdf',
        'documents/talent_123/image-rights-2025-2026.pdf',
        'documents/talent_123/image-rights-2026-2027.pdf',
      ]),
    );
    // Six distinct objects, deduplicated: a retired column and a dossier row
    // usually agree, and deleting the same key twice logs a spurious failure.
    expect(documentKeys).toHaveLength(6);
    expect(new Set(documentKeys).size).toBe(documentKeys.length);
    expect(mockTx.onboarding_Record.deleteMany).toHaveBeenCalledWith({
      where: { talentId: 'talent_123' },
    });

    // A closing holds the team's verdict on a minor plus a note under each
    // question, so an erasure that stops deleting it leaves staff prose about a
    // named child behind. Asserted rather than assumed: the hand-written mock
    // above only fails on a delegate nobody declared, never on a call that
    // quietly stopped being made, so before this the whole closing family could
    // have dropped out of the erasure with the suite still green.
    expect(mockTx.closing_Record.deleteMany).toHaveBeenCalledWith({
      where: { talentId: 'talent_123' },
    });
    expect(mockTx.closing_ResetEvent.deleteMany).toHaveBeenCalledWith({
      where: { talentId: 'talent_123' },
    });
    // The same guarantee for the two other free-text stores on a talent. The
    // feedback one is asserted on the call rather than on its filter, which is
    // deliberately wider than a talent id (it also catches public submissions
    // matched back by email); what matters here is that the call still happens.
    expect(mockTx.note_TalentNote.deleteMany).toHaveBeenCalledWith({
      where: { talentId: 'talent_123' },
    });
    expect(mockTx.feedback_Submission.deleteMany).toHaveBeenCalled();

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
