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
import type { AuthVerdictRepair } from './authIdentity';

export type SyncErrorKind = Sync_ErrorKind;

/** One label per cause: two different causes never share one. */
export const SYNC_ERROR_KIND_LABELS: Record<SyncErrorKind, string> = {
  MISSING_NAME: 'Contact sans nom',
  ADDRESS_TAKEN: 'Adresse déjà utilisée',
  LOGIN_FAILURE: 'Échec technique de connexion',
  MERGE_REFUSED: 'Fiches à réunir',
};

/** Display order, the one the page filter and the API breakdown follow. */
export const SYNC_ERROR_KINDS: readonly SyncErrorKind[] = [
  'ADDRESS_TAKEN',
  'MERGE_REFUSED',
  'MISSING_NAME',
  'LOGIN_FAILURE',
];

/**
 * Who stands behind the address a talent could not take, reduced to what the
 * explanation says about them. `sameName` is whether the other talent carries
 * this talent's own name, which is how one person recorded twice in Salesforce
 * shows from Jump.
 */
export type AddressHolder =
  | { kind: 'talent'; sameName: boolean }
  | { kind: 'parent' }
  | { kind: 'staff' }
  | { kind: 'orphan' };

/**
 * Everything an explanation depends on: two errors in the same situation read
 * identically. The converse does not hold, so the API groups on the
 * explanation itself.
 */
export type SyncErrorSituation =
  | { kind: 'MISSING_NAME' }
  | {
      kind: 'ADDRESS_TAKEN';
      /** The talent has a login account today. */
      hasAccount: boolean;
      /** Who holds the address now; null when nobody does any more. */
      holder: AddressHolder | null;
      /**
       * The repair the Connexion tab of Divergences Salesforce offers for this
       * talent (`actionForVerdict` on its verdict), null when the tab lists
       * the case without one or does not list it at all.
       */
      repair: AuthVerdictRepair | null;
    }
  | { kind: 'LOGIN_FAILURE'; hasAccount: boolean }
  | { kind: 'MERGE_REFUSED' };

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

/** The Connexion tab's repairs, said as the step an admin takes there. */
const CONNEXION_REPAIRS: Record<AuthVerdictRepair, string> = {
  repointDrop:
    'Basculer le talent sur ce compte dans Divergences Salesforce, onglet Connexion.',
  swap: 'Échanger les deux comptes dans Divergences Salesforce, onglet Connexion.',
};

const SALESFORCE_OWN_ADDRESS =
  "Mettre l'adresse du talent lui-même dans Salesforce. Le compte est réglé au passage suivant.";

function holderSentence(
  holder: AddressHolder,
  repair: AuthVerdictRepair | null,
): string {
  switch (holder.kind) {
    case 'parent':
      return "L'adresse Salesforce du talent est celle d'un parent.";
    case 'staff':
      return "L'adresse Salesforce du talent est celle d'un compte staff.";
    case 'orphan':
      return "L'adresse Salesforce du talent est portée par un compte de connexion rattaché à personne.";
    case 'talent':
      if (holder.sameName)
        return "L'adresse Salesforce du talent est déjà celle d'un autre talent qui porte le même nom : très probablement la même personne, enregistrée deux fois dans Salesforce.";
      return repair === 'swap'
        ? "L'adresse Salesforce du talent est celle du compte d'un autre talent, et son propre compte porte l'adresse de cet autre talent : leurs deux adresses sont inversées."
        : "L'adresse Salesforce du talent est déjà celle d'un autre talent.";
  }
}

function addressRemedy(
  holder: AddressHolder,
  repair: AuthVerdictRepair | null,
): SyncErrorRemedy {
  // Said before any repair: swapping the logins of two records of one person
  // would not make them one. Jump merges the talents of the Leads Salesforce
  // converted into one contact, so two that remain apart are a Lead that was
  // never converted: converting it into the contact is the fix.
  if (holder.kind === 'talent' && holder.sameName)
    return {
      who: 'salesforce',
      text: 'Si les deux fiches sont la même personne, convertir dans Salesforce son lead resté seul vers son contact : Jump réunit les deux fiches au plus tard à la reprise complète suivante.',
    };
  if (repair)
    return {
      who: 'jump',
      text: CONNEXION_REPAIRS[repair],
      href: CONNEXION_TAB,
    };
  switch (holder.kind) {
    case 'parent':
    case 'staff':
      return { who: 'salesforce', text: SALESFORCE_OWN_ADDRESS };
    case 'orphan':
      // No repair means the talent has no account yet, and `ensureTalentUser`
      // adopts an orphan account as its login on the next pass.
      return {
        who: 'automatic',
        text: 'Rien à faire : le prochain passage rattache le talent à ce compte.',
      };
    case 'talent':
      return {
        who: 'salesforce',
        text: "Corriger l'adresse de celui des deux contacts qui porte la mauvaise dans Salesforce.",
      };
  }
}

function addressTaken(
  holder: AddressHolder | null,
  repair: AuthVerdictRepair | null,
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
  return {
    whatHappened: holderSentence(holder, repair),
    remedy: addressRemedy(holder, repair),
  };
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
        ...addressTaken(situation.holder, situation.repair),
      };
    case 'MERGE_REFUSED':
      return {
        label,
        whatHappened:
          "Salesforce rattache plusieurs fiches Jump à ce contact (les leads qu'il a été avant d'être converti), et plusieurs d'entre elles ont déjà servi : une connexion ou un dossier d'onboarding. Jump ne les réunit pas seul, pour ne rien perdre de ce qui y a été fait.",
        consequence:
          'La personne garde plusieurs fiches, et Jump ne reprend plus ses informations depuis Salesforce.',
        remedy: {
          who: 'developer',
          text: 'Choisir la fiche que la personne garde demande un arbitrage : transmettre ce cas à un développeur, avec les fiches en cause.',
        },
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
