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
});
