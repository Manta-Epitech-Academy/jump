/**
 * The explanation an admin reads for a sync error, page and API alike.
 *
 * Pinned over every situation rather than a few examples because the failure
 * it replaces was silent: one sentence told the admin to fix Salesforce for
 * every address conflict, including the one nobody can fix, and three causes
 * read under one label.
 */

import { describe, it, expect } from 'vitest';
import {
  explainSyncError,
  SYNC_ERROR_KIND_LABELS,
  type AddressHolder,
  type SyncErrorSituation,
} from './syncError';

const holders: (AddressHolder | null)[] = [
  null,
  { kind: 'talent', account: true, sameName: false },
  { kind: 'talent', account: false, sameName: false },
  { kind: 'talent', account: true, sameName: true },
  { kind: 'talent', account: false, sameName: true },
  { kind: 'parent', account: true },
  { kind: 'parent', account: false },
  { kind: 'staff' },
  { kind: 'orphan' },
];

const situations: SyncErrorSituation[] = [
  { kind: 'MISSING_NAME' },
  { kind: 'LOGIN_FAILURE', hasAccount: true },
  { kind: 'LOGIN_FAILURE', hasAccount: false },
  ...[true, false].flatMap((hasAccount) =>
    holders.map((holder): SyncErrorSituation => ({
      kind: 'ADDRESS_TAKEN',
      hasAccount,
      holder,
    })),
  ),
];

describe('explainSyncError', () => {
  it('says what happened, the consequence and a remedy in every situation', () => {
    for (const s of situations) {
      const e = explainSyncError(s);
      expect(e.label).toBe(SYNC_ERROR_KIND_LABELS[s.kind]);
      expect(e.whatHappened.length).toBeGreaterThan(0);
      expect(e.consequence.length).toBeGreaterThan(0);
      expect(e.remedy.text.length).toBeGreaterThan(0);
    }
  });

  it('gives every cause its own label', () => {
    const labels = Object.values(SYNC_ERROR_KIND_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('says the talent cannot log in only when it has no account', () => {
    const without = explainSyncError({
      kind: 'ADDRESS_TAKEN',
      hasAccount: false,
      holder: { kind: 'parent', account: true },
    });
    const withAccount = explainSyncError({
      kind: 'ADDRESS_TAKEN',
      hasAccount: true,
      holder: { kind: 'parent', account: true },
    });
    expect(without.consequence).toMatch(/ne peut pas se connecter/);
    expect(withAccount.consequence).toMatch(/ancienne adresse/);
  });

  it('admits there is no fix for one person recorded twice', () => {
    for (const hasAccount of [true, false])
      for (const account of [true, false])
        expect(
          explainSyncError({
            kind: 'ADDRESS_TAKEN',
            hasAccount,
            holder: { kind: 'talent', account, sameName: true },
          }).remedy.who,
        ).toBe('none');
  });

  it('sends to the Connexion tab only when it lists the case', () => {
    // The tab lists a talent with an account whose Salesforce address another
    // account holds, and repairs only an orphan or an inversion between two
    // talents. A parent or a staff holder is fixed in Salesforce.
    const remedyOf = (hasAccount: boolean, holder: AddressHolder) =>
      explainSyncError({ kind: 'ADDRESS_TAKEN', hasAccount, holder }).remedy
        .who;
    expect(remedyOf(true, { kind: 'orphan' })).toBe('jump');
    expect(
      remedyOf(true, { kind: 'talent', account: true, sameName: false }),
    ).toBe('jump');
    expect(
      remedyOf(false, { kind: 'talent', account: true, sameName: false }),
    ).toBe('salesforce');
    expect(remedyOf(true, { kind: 'parent', account: true })).toBe(
      'salesforce',
    );
    expect(remedyOf(true, { kind: 'staff' })).toBe('salesforce');
  });

  it('asks nothing of anyone once the address is free', () => {
    expect(
      explainSyncError({
        kind: 'ADDRESS_TAKEN',
        hasAccount: false,
        holder: null,
      }).remedy.who,
    ).toBe('automatic');
  });
});
