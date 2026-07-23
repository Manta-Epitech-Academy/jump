import { describe, it, expect, vi } from 'vitest';
import {
  upsertSchoolingYearRecord,
  rolloverSchoolYear,
} from './schoolingService';
import type { Prisma } from '@prisma/client';
import { schoolYearOf } from '$lib/domain/schoolYear';

describe('schoolingService', () => {
  it('upsertSchoolingYearRecord creates/updates record and refreshes Talent projection if current school year', async () => {
    const currentSY = schoolYearOf(new Date(), 'Europe/Paris').label;

    const mockTx = {
      schooling_YearRecord: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'rec_1',
          talentId: 'talent_123',
          schoolYear: currentSY,
          niveau: '2nde',
          schoolId: 'school_abc',
        }),
        upsert: vi.fn().mockResolvedValue({
          id: 'rec_1',
          talentId: 'talent_123',
          schoolYear: currentSY,
          niveau: '2nde',
          schoolId: 'school_abc',
          source: 'sync',
        }),
      },
      talent: {
        update: vi.fn().mockResolvedValue({}),
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
      data: {
        niveau: '2nde',
        schoolId: 'school_abc',
      },
    });
  });

  it('rolloverSchoolYear advances previous year records into current year', async () => {
    const fixedNow = new Date('2026-08-01T10:00:00Z');
    const currentSY = schoolYearOf(fixedNow, 'Europe/Paris');
    const prevLabel = `${currentSY.startYear - 1}-${currentSY.startYear}`;
    const currLabel = currentSY.label;

    const previousRecords = [
      {
        id: 'rec_1',
        talentId: 'talent_1',
        schoolYear: prevLabel,
        niveau: '2nde',
        schoolId: 'school_1',
      },
      {
        id: 'rec_2',
        talentId: 'talent_2',
        schoolYear: prevLabel,
        niveau: 'terminale',
        schoolId: 'school_2',
      },
      {
        id: 'rec_3',
        talentId: 'talent_3',
        schoolYear: prevLabel,
        niveau: 'bac_5',
        schoolId: null,
      },
    ];

    const currentRecords: { talentId: string }[] = [
      { talentId: 'talent_3' }, // talent_3 already rolled over
    ];

    const mockTx = {
      schooling_YearRecord: {
        findMany: vi.fn().mockImplementation(({ where }) => {
          if (where.schoolYear === prevLabel)
            return Promise.resolve(previousRecords);
          if (where.schoolYear === currLabel)
            return Promise.resolve(currentRecords);
          return Promise.resolve([]);
        }),
        create: vi.fn().mockResolvedValue({}),
      },
      talent: {
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await rolloverSchoolYear(mockTx, fixedNow, 'Europe/Paris');

    expect(result.processedCount).toBe(3);
    expect(result.createdCount).toBe(2);

    // talent_1: 2nde -> 1ere
    expect(mockTx.schooling_YearRecord.create).toHaveBeenCalledWith({
      data: {
        talentId: 'talent_1',
        schoolYear: currLabel,
        niveau: '1ere',
        schoolId: 'school_1',
        source: 'rollover',
      },
    });
    expect(mockTx.talent.update).toHaveBeenCalledWith({
      where: { id: 'talent_1' },
      data: { niveau: '1ere', schoolId: 'school_1' },
    });

    // talent_2: terminale -> bac_1
    expect(mockTx.schooling_YearRecord.create).toHaveBeenCalledWith({
      data: {
        talentId: 'talent_2',
        schoolYear: currLabel,
        niveau: 'bac_1',
        schoolId: 'school_2',
        source: 'rollover',
      },
    });
  });
});
