import { describe, it, expect, vi } from 'vitest';
import { upsertSchoolingYearRecord } from './schoolingService';
import type { Prisma } from '@prisma/client';
import { schoolYearOf } from '$lib/domain/schoolYear';

describe('schoolingService', () => {
  it('upsertSchoolingYearRecord upserts the record and refreshes the Talent projection for the current school year', async () => {
    const currentSY = schoolYearOf(new Date(), 'Europe/Paris').label;

    const mockTx = {
      talent: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ niveau: '2nde', schoolId: 'school_abc' }),
        update: vi.fn().mockResolvedValue({}),
      },
      schooling_YearRecord: {
        upsert: vi.fn().mockResolvedValue({
          id: 'rec_1',
          talentId: 'talent_123',
          schoolYear: currentSY,
          niveau: '2nde',
          schoolId: 'school_abc',
          source: 'sync',
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const record = await upsertSchoolingYearRecord(mockTx, {
      talentId: 'talent_123',
      schoolYear: currentSY,
      niveau: '2nde',
      schoolId: 'school_abc',
      source: 'sync',
    });

    expect(record.niveau).toBe('2nde');
    expect(mockTx.schooling_YearRecord.upsert).toHaveBeenCalled();
    expect(mockTx.talent.update).toHaveBeenCalledWith({
      where: { id: 'talent_123' },
      data: { niveau: '2nde', schoolId: 'school_abc' },
    });
  });

  it('upsertSchoolingYearRecord carries the talent niveau forward on create when only schoolId is supplied (never nulls the projection)', async () => {
    const currentSY = schoolYearOf(new Date(), 'Europe/Paris').label;

    const mockTx = {
      talent: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ niveau: '2nde', schoolId: 'old_school' }),
        update: vi.fn().mockResolvedValue({}),
      },
      schooling_YearRecord: {
        // Echo back what the create branch persists, so the projection reads the
        // carried-forward niveau rather than a null.
        upsert: vi.fn().mockImplementation(({ create }) =>
          Promise.resolve({
            id: 'rec_2',
            talentId: create.talentId,
            schoolYear: create.schoolYear,
            niveau: create.niveau,
            schoolId: create.schoolId,
            source: create.source,
          }),
        ),
      },
    } as unknown as Prisma.TransactionClient;

    const record = await upsertSchoolingYearRecord(mockTx, {
      talentId: 'talent_123',
      schoolYear: currentSY,
      schoolId: 'new_school',
      source: 'onboarding',
    });

    // niveau carried from the talent (2nde), NOT wiped to null; schoolId from input.
    expect(mockTx.schooling_YearRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          niveau: '2nde',
          schoolId: 'new_school',
        }),
      }),
    );
    expect(record.niveau).toBe('2nde');
    expect(record.schoolId).toBe('new_school');
    expect(mockTx.talent.update).toHaveBeenCalledWith({
      where: { id: 'talent_123' },
      data: { niveau: '2nde', schoolId: 'new_school' },
    });
  });

  it('upsertSchoolingYearRecord leaves the Talent projection alone when the record is a past school year', async () => {
    const pastSY = '2019-2020';

    const mockTx = {
      talent: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ niveau: 'Terminale', schoolId: 'school_now' }),
        update: vi.fn().mockResolvedValue({}),
      },
      schooling_YearRecord: {
        upsert: vi.fn().mockResolvedValue({
          id: 'rec_3',
          talentId: 'talent_123',
          schoolYear: pastSY,
          niveau: '3eme',
          schoolId: 'school_then',
          source: 'staff',
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await upsertSchoolingYearRecord(mockTx, {
      talentId: 'talent_123',
      schoolYear: pastSY,
      niveau: '3eme',
      schoolId: 'school_then',
      source: 'staff',
    });

    // Correcting history must not drag the talent back to a level they left:
    // the row is written, the projection is untouched.
    expect(mockTx.schooling_YearRecord.upsert).toHaveBeenCalled();
    expect(mockTx.talent.update).not.toHaveBeenCalled();
  });
});
