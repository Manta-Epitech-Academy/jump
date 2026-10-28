/**
 * What a Salesforce sync error means, said once for the admin page and for the
 * admin API (`stats_sync_health`), so an error reads the same in both.
 *
 * `Sync_Error` stores only the cause. Everything here is derived from the
 * state at the moment it is read: whether the talent has a login account, and
 * who holds the address it could not take. A sentence stored at the failure
 * went stale as soon as somebody acted, and three different failures had come
 * to share one label and one sentence that told the admin to fix Salesforce,
 * even where nobody can.
 *
 * Holds no name and no address, on purpose: the API quotes these sentences, and
 * no talent identity may reach it. The page names the people beside them.
 */

import type { Sync_ErrorKind } from '@prisma/client';

export type SyncErrorKind = Sync_ErrorKind;

/** One label per cause: two different causes never share one. */
export const SYNC_ERROR_KIND_LABELS: Record<SyncErrorKind, string> = {
  MISSING_NAME: 'Contact sans nom',
  ADDRESS_TAKEN: 'Adresse déjà utilisée',
  LOGIN_FAILURE: 'Échec technique de connexion',
};

/** Display order, the one the page filter and the API breakdown follow. */
export const SYNC_ERROR_KINDS: readonly SyncErrorKind[] = [
  'ADDRESS_TAKEN',
  'MISSING_NAME',
  'LOGIN_FAILURE',
];

/**
 * Who stands behind the address a talent could not take, reduced to what
 * decides the remedy. `account` says whether a login account holds it (the
 * Connexion tab of Divergences Salesforce can act only on an account), and
 * `sameName` whether the other talent carries this talent's own name, which is
 * how one person recorded twice in Salesforce shows from Jump.
 */
export type AddressHolder =
  | { kind: 'talent'; account: boolean; sameName: boolean }
  | { kind: 'parent'; account: boolean }
  | { kind: 'staff' }
  | { kind: 'orphan' };

/**
 * Everything an explanation depends on. Two errors in the same situation read
 * identically, which is what the API groups on.
 */
export type SyncErrorSituation =
  | { kind: 'MISSING_NAME' }
  | {
      kind: 'ADDRESS_TAKEN';
      /** The talent has a login account today. */
      hasAccount: boolean;
      /** Who holds the address now; null when nobody does any more. */
      holder: AddressHolder | null;
    }
  | { kind: 'LOGIN_FAILURE'; hasAccount: boolean };

/** Who can fix it, and where. `none` is said, never replaced by a fix that
 * cannot be made. */
export type SyncErrorRemedy =
  | { who: 'salesforce' | 'automatic' | 'developer'; text: string }
  | { who: 'jump'; text: string; href: string }
  | { who: 'none'; text: string };

export type SyncErrorExplanation = {
  label: string;
  whatHappened: string;
  consequence: string;
  remedy: SyncErrorRemedy;
};

/** French name of each remedy's actor, for a badge or an API row. */
export const REMEDY_WHO_LABELS: Record<SyncErrorRemedy['who'], string> = {
  salesforce: 'Dans Salesforce',
  jump: 'Dans Jump',
  automatic: 'Automatique',
  developer: 'Développeur',
  none: 'Aucune correction connue',
};

const CONNEXION_TAB = '/staff/admin/sf-conflicts';

function loginConsequence(hasAccount: boolean): string {
  return hasAccount
    ? 'Le talent se connecte toujours avec son ancienne adresse, pas avec celle de Salesforce.'
    : "Le talent ne peut pas se connecter : il n'a pas de compte de connexion.";
}

function addressTaken(
  hasAccount: boolean,
  holder: AddressHolder | null,
): Pick<SyncErrorExplanation, 'whatHappened' | 'remedy'> {
  if (!holder)
    return {
      whatHappened:
        "L'adresse Salesforce du talent était déjà utilisée au dernier passage, et elle est libre aujourd'hui.",
      remedy: {
        who: 'automatic',
        text: 'Rien à faire : le prochain passage règle le compte de connexion.',
      },
    };

  switch (holder.kind) {
    case 'parent':
      return {
        whatHappened: "L'adresse Salesforce du talent est celle d'un parent.",
        remedy: {
          who: 'salesforce',
          text: "Mettre l'adresse du talent lui-même dans Salesforce. Le compte est réglé au passage suivant.",
        },
      };
    case 'staff':
      return {
        whatHappened:
          "L'adresse Salesforce du talent est celle d'un compte staff.",
        remedy: {
          who: 'salesforce',
          text: "Mettre l'adresse du talent lui-même dans Salesforce. Le compte est réglé au passage suivant.",
        },
      };
    case 'orphan':
      // `ensureTalentUser` adopts an orphan account on its own, so only a
      // talent who already has an account meets one, and the Connexion tab
      // repoints it onto the orphan.
      return {
        whatHappened:
          "L'adresse Salesforce du talent est portée par un compte de connexion rattaché à personne.",
        remedy: {
          who: 'jump',
          text: 'Basculer le talent sur ce compte dans Divergences Salesforce, onglet Connexion.',
          href: CONNEXION_TAB,
        },
      };
    case 'talent':
      if (holder.sameName)
        return {
          whatHappened:
            "L'adresse Salesforce du talent est déjà celle d'un autre talent qui porte le même nom : très probablement la même personne, enregistrée deux fois dans Salesforce.",
          remedy: {
            who: 'none',
            text: "Aucune correction connue aujourd'hui : Jump ne sait pas réunir deux fiches, et l'ancienne fiche Salesforce n'est souvent plus modifiable.",
          },
        };
      if (hasAccount && holder.account)
        return {
          whatHappened:
            "L'adresse Salesforce du talent est déjà celle du compte d'un autre talent.",
          remedy: {
            who: 'jump',
            text: 'Arbitrer entre les deux comptes dans Divergences Salesforce, onglet Connexion.',
            href: CONNEXION_TAB,
          },
        };
      return {
        whatHappened:
          "L'adresse Salesforce du talent est déjà celle d'un autre talent.",
        remedy: {
          who: 'salesforce',
          text: "Corriger l'adresse de celui des deux contacts qui porte la mauvaise dans Salesforce.",
        },
      };
  }
}

export function explainSyncError(
  situation: SyncErrorSituation,
): SyncErrorExplanation {
  const label = SYNC_ERROR_KIND_LABELS[situation.kind];
  switch (situation.kind) {
    case 'MISSING_NAME':
      return {
        label,
        whatHappened:
          "Le contact Salesforce n'a pas de prénom ou pas de nom. Tant qu'il en manque un, une reprise complète ne retire aucune inscription des campagnes où il figure.",
        consequence:
          "Jump ne reprend pas ce contact : aucune fiche s'il est nouveau, plus de mise à jour sinon.",
        remedy: {
          who: 'salesforce',
          text: 'Compléter le prénom et le nom du contact dans Salesforce. Il est repris au passage suivant.',
        },
      };
    case 'ADDRESS_TAKEN':
      return {
        label,
        consequence: loginConsequence(situation.hasAccount),
        ...addressTaken(situation.hasAccount, situation.holder),
      };
    case 'LOGIN_FAILURE':
      return {
        label,
        whatHappened: situation.hasAccount
          ? "Le changement d'adresse du compte de connexion a échoué pour une raison technique."
          : 'La création du compte de connexion a échoué pour une raison technique.',
        consequence: loginConsequence(situation.hasAccount),
        remedy: {
          who: 'developer',
          text: "Réessayé à chaque passage. Si l'erreur persiste, transmettre le détail technique à un développeur.",
        },
      };
  }
}
