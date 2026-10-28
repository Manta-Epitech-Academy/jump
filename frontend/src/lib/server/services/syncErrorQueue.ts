/**
 * The open sync errors, each in its situation now: read by the admin page,
 * which names the people involved, and by `stats_sync_health`, which counts
 * situations and names nobody. One read, so the two cannot explain one error
 * differently.
 *
 * Nothing about the explanation is stored (`Sync_Error` holds the cause); it is
 * derived here from the talent's account and from who holds its address today,
 * through the same directory the Connexion tab of Divergences Salesforce reads.
 */

import type { Sync_ErrorKind } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { loadAddressDirectory } from '$lib/server/services/authIdentityService';
import { foldForSearch } from '$lib/components/staff/datatable/search';
import type { AccountNature } from '$lib/domain/authIdentity';
import {
  explainSyncError,
  type AddressHolder,
  type SyncErrorExplanation,
  type SyncErrorSituation,
} from '$lib/domain/syncError';

/** A person an error concerns, as much as Jump knows of them. */
export type SyncErrorPerson = {
  /** The Jump talent, when there is one to open. */
  talentId: string | null;
  prenom: string;
  nom: string;
  /** The address the talent logs in with, when it has an account. */
  loginEmail: string | null;
  externalId: string | null;
};

export type OpenSyncError = {
  id: string;
  kind: Sync_ErrorKind;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  detail: string | null;
  situation: SyncErrorSituation;
  explanation: SyncErrorExplanation;
  /** Whom the sync failed for. */
  subject: SyncErrorPerson & {
    /** The address Salesforce gives this contact, the one in the way. */
    sfEmail: string | null;
  };
  /** Who holds the address in the way, named: the other record in cause. */
  holder: AccountNature | null;
};

const norm = (email: string | null | undefined): string | null =>
  email?.toLowerCase().trim() || null;

const sameName = (
  a: { prenom: string; nom: string },
  b: { prenom: string; nom: string },
) =>
  foldForSearch(`${a.prenom} ${a.nom}`).replace(/\s+/g, ' ').trim() ===
  foldForSearch(`${b.prenom} ${b.nom}`).replace(/\s+/g, ' ').trim();

/**
 * Reduce a named holder to what decides the remedy. `viaAccount` says whether
 * an account holds the address (`holderOf`) or only a person's contact does
 * (`ownerOf`). `this_talent` means the talent's own account holds it now, which
 * is the problem gone, so it reads as nobody.
 */
function holderSituation(
  nature: AccountNature | null,
  viaAccount: boolean,
  subject: { prenom: string; nom: string },
): AddressHolder | null {
  if (!nature) return null;
  switch (nature.kind) {
    case 'this_talent':
      return null;
    case 'staff':
      return { kind: 'staff' };
    case 'orphan':
      return { kind: 'orphan' };
    case 'parent':
      return { kind: 'parent', account: viaAccount };
    case 'talent':
      return {
        kind: 'talent',
        account: viaAccount,
        sameName: sameName(nature, subject),
      };
  }
}

/**
 * Every open error, oldest first: the age of an error is what tells an admin
 * it has been waiting. Uncapped on purpose, so no open error is ever out of
 * view; the queue is bounded by the talents a pass carries.
 */
export async function loadOpenSyncErrors(): Promise<OpenSyncError[]> {
  const rows = await prisma.sync_Error.findMany({
    orderBy: { firstOccurredAt: 'asc' },
    select: {
      id: true,
      kind: true,
      externalId: true,
      contactName: true,
      email: true,
      detail: true,
      firstOccurredAt: true,
      lastOccurredAt: true,
      talent: {
        select: {
          id: true,
          prenom: true,
          nom: true,
          externalId: true,
          user: { select: { email: true } },
          sfImport: { select: { sfEmail: true } },
        },
      },
    },
  });

  // A nameless contact may still be a talent Jump has (its name was blanked in
  // Salesforce after it was taken in), and then there is a fiche to open.
  const contactIds = rows.flatMap((r) => (r.externalId ? [r.externalId] : []));
  const knownContacts = contactIds.length
    ? await prisma.talent.findMany({
        where: { externalId: { in: contactIds } },
        select: {
          id: true,
          prenom: true,
          nom: true,
          externalId: true,
          user: { select: { email: true } },
        },
      })
    : [];
  const talentByExternalId = new Map(
    knownContacts.map((t) => [t.externalId!, t]),
  );

  const directory = await loadAddressDirectory(
    rows.flatMap((r) => {
      const e = r.kind === 'ADDRESS_TAKEN' && norm(r.talent?.sfImport?.sfEmail);
      return e ? [e] : [];
    }),
  );

  return rows.map((r): OpenSyncError => {
    const base = {
      id: r.id,
      kind: r.kind,
      firstOccurredAt: r.firstOccurredAt,
      lastOccurredAt: r.lastOccurredAt,
      detail: r.detail,
    };

    if (!r.talent) {
      const known = r.externalId ? talentByExternalId.get(r.externalId) : null;
      const situation: SyncErrorSituation = { kind: 'MISSING_NAME' };
      return {
        ...base,
        situation,
        explanation: explainSyncError(situation),
        subject: {
          talentId: known?.id ?? null,
          prenom: known?.prenom ?? '',
          nom: known?.nom ?? r.contactName ?? '',
          loginEmail: norm(known?.user?.email),
          externalId: r.externalId,
          sfEmail: r.email,
        },
        holder: null,
      };
    }

    const t = r.talent;
    const hasAccount = t.user !== null;
    const sfEmail = norm(t.sfImport?.sfEmail);
    const subject = {
      talentId: t.id,
      prenom: t.prenom,
      nom: t.nom,
      loginEmail: norm(t.user?.email),
      externalId: t.externalId,
      sfEmail,
    };

    if (r.kind === 'LOGIN_FAILURE') {
      const situation: SyncErrorSituation = {
        kind: 'LOGIN_FAILURE',
        hasAccount,
      };
      return {
        ...base,
        situation,
        explanation: explainSyncError(situation),
        subject,
        holder: null,
      };
    }

    const byAccount = sfEmail ? directory.holderOf(sfEmail, t.id) : null;
    const holder =
      byAccount ?? (sfEmail ? directory.ownerOf(sfEmail, t.id) : null);
    const situation: SyncErrorSituation = {
      kind: 'ADDRESS_TAKEN',
      hasAccount,
      holder: holderSituation(holder, byAccount !== null, t),
    };
    return {
      ...base,
      situation,
      explanation: explainSyncError(situation),
      subject,
      holder: holder?.kind === 'this_talent' ? null : holder,
    };
  });
}
