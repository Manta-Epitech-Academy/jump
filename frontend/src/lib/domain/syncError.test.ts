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
import type { AuthVerdictRepair } from './authIdentity';

const holders: (AddressHolder | null)[] = [
  null,
  { kind: 'talent', sameName: false },
  { kind: 'talent', sameName: true },
  { kind: 'parent' },
  { kind: 'staff' },
  { kind: 'orphan' },
];

const repairs: (AuthVerdictRepair | null)[] = [null, 'repointDrop', 'swap'];

const situations: SyncErrorSituation[] = [
  { kind: 'MISSING_NAME' },
  { kind: 'MERGE_REFUSED' },
  { kind: 'LOGIN_FAILURE', hasAccount: true },
  { kind: 'LOGIN_FAILURE', hasAccount: false },
  ...[true, false].flatMap((hasAccount) =>
    holders.flatMap((holder) =>
      repairs.map((repair): SyncErrorSituation => ({
        kind: 'ADDRESS_TAKEN',
        hasAccount,
        holder,
        repair,
      })),
    ),
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
      holder: { kind: 'parent' },
      repair: null,
    });
    const withAccount = explainSyncError({
      kind: 'ADDRESS_TAKEN',
      hasAccount: true,
      holder: { kind: 'parent' },
      repair: null,
    });
    expect(without.consequence).toMatch(/ne peut pas se connecter/);
    expect(withAccount.consequence).toMatch(/ancienne adresse/);
  });

  // Jump merges the talents of the Leads converted into one contact, so one
  // person still recorded twice is a Lead Salesforce never converted, and
  // converting it is what lets the next pass merge them. Never a login swap:
  // two records with swapped logins are still two records.
  it('sends one person recorded twice to the conversion of the lone Lead', () => {
    for (const hasAccount of [true, false])
      for (const repair of repairs)
        expect(
          explainSyncError({
            kind: 'ADDRESS_TAKEN',
            hasAccount,
            holder: { kind: 'talent', sameName: true },
            repair,
          }).remedy,
        ).toMatchObject({
          who: 'salesforce',
          text: expect.stringMatching(/convertir/),
        });
  });

  it('sends to the Connexion tab exactly when the tab has a repair', () => {
    // The page reads the tab's own verdict, so a holder the tab only escalates
    // (a degraded inversion, a parent, a staff account) never reads « Dans
    // Jump » here, whatever account stands behind it.
    const remedyOf = (
      holder: AddressHolder,
      repair: AuthVerdictRepair | null,
    ) =>
      explainSyncError({
        kind: 'ADDRESS_TAKEN',
        hasAccount: true,
        holder,
        repair,
      }).remedy;
    expect(remedyOf({ kind: 'orphan' }, 'repointDrop')).toMatchObject({
      who: 'jump',
      text: expect.stringMatching(/Basculer/),
    });
    expect(remedyOf({ kind: 'talent', sameName: false }, 'swap')).toMatchObject(
      { who: 'jump', text: expect.stringMatching(/Échanger/) },
    );
    expect(remedyOf({ kind: 'talent', sameName: false }, null).who).toBe(
      'salesforce',
    );
    expect(remedyOf({ kind: 'parent' }, null).who).toBe('salesforce');
    expect(remedyOf({ kind: 'staff' }, null).who).toBe('salesforce');
  });

  it('leaves an orphan account to the next pass when there is no account to repoint', () => {
    // `ensureTalentUser` adopts an orphan as the login of a talent without one.
    expect(
      explainSyncError({
        kind: 'ADDRESS_TAKEN',
        hasAccount: false,
        holder: { kind: 'orphan' },
        repair: null,
      }).remedy.who,
    ).toBe('automatic');
  });

  it('asks nothing of anyone once the address is free', () => {
    expect(
      explainSyncError({
        kind: 'ADDRESS_TAKEN',
        hasAccount: false,
        holder: null,
        repair: null,
      }).remedy.who,
    ).toBe('automatic');
  });
});
