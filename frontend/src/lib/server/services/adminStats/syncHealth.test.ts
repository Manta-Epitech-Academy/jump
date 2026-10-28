/**
 * `errorsBySituation` is quoted row by row, and its reader is told never to add
 * figures up. So two rows that read the same would answer one question with
 * two partial counts, and the most frequent situation would rank lower than it
 * is.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  explainSyncError,
  type SyncErrorSituation,
} from '$lib/domain/syncError';
import type { OpenSyncError } from '$lib/server/services/syncErrorQueue';

vi.mock('$lib/server/db', () => ({ prisma: {} }));

const { errorSituations } = await import('./syncHealth');

const openError = (situation: SyncErrorSituation) =>
  ({
    kind: situation.kind,
    situation,
    explanation: explainSyncError(situation),
  }) as OpenSyncError;

describe('errorSituations', () => {
  it('counts as one row the situations that read the same', () => {
    // One person recorded twice reads the same whether or not the Connexion
    // tab could swap the two logins: no swap makes two records one person.
    const twice = (repair: 'swap' | null) =>
      openError({
        kind: 'ADDRESS_TAKEN',
        hasAccount: true,
        holder: { kind: 'talent', sameName: true },
        repair,
      });

    const rows = errorSituations([
      twice('swap'),
      twice(null),
      openError({ kind: 'MISSING_NAME' }),
    ]);

    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ['Adresse déjà utilisée', 2],
      ['Contact sans nom', 1],
    ]);
  });
});
