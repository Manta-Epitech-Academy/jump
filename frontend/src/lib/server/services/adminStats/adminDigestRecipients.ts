/**
 * Who receives the Monday digest: the admins chosen for it, and nobody else.
 *
 * The one rule, held here so the send (`services/adminDigest/`) and the answer
 * to "who gets it" (`config_admin_digest`) cannot disagree: an account receives
 * the digest when it is admin AND `receivesAdminDigest` is set. The role is read
 * at the moment of asking, the way `verifyToken` re-reads it for a token, so a
 * demotion stops the mail without anybody clearing the choice, and a departure
 * removes the account with it.
 *
 * The one staff identity any answer of the API carries is here, and it is
 * deliberate. The tier's rule keeps people out of answers because most of the
 * people Jump holds are minors; this read names admins, to the admins who choose
 * among them, by the work address each one logs in with, and the question it
 * answers is precisely "which of us". Counting them instead would leave the list
 * unreadable anywhere but in the audit rows.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { metric } from '$lib/server/adminApi/metrics';
import {
  digestBaseline,
  lastDigestRun,
} from '$lib/server/services/adminDigest/ledger';

/** Every admin account, whether it receives the digest or not. */
const ADMIN_ACCOUNT = {
  staffProfile: { staffRole: 'admin' },
} satisfies Prisma.bauth_userWhereInput;

/** The admin accounts the digest goes to. */
const RECIPIENT = {
  staffProfile: { staffRole: 'admin', receivesAdminDigest: true },
} satisfies Prisma.bauth_userWhereInput;

/**
 * More than any team Jump will have, and only there because every list is
 * capped. The count of recipients is taken apart, so it never depends on it.
 */
export const ADMIN_ACCOUNTS_LIMIT = 100;

/** Login addresses the digest is sent to. Empty means no digest goes out. */
export async function adminDigestRecipients(): Promise<string[]> {
  const rows = await prisma.bauth_user.findMany({
    where: RECIPIENT,
    select: { email: true },
  });
  return rows.map((r) => r.email);
}

export async function getAdminDigestRecipients() {
  const [rows, recipients, lastRun] = await Promise.all([
    prisma.bauth_user.findMany({
      where: ADMIN_ACCOUNT,
      orderBy: { email: 'asc' },
      take: ADMIN_ACCOUNTS_LIMIT,
      select: {
        email: true,
        staffProfile: { select: { receivesAdminDigest: true } },
      },
    }),
    prisma.bauth_user.count({ where: RECIPIENT }),
    lastDigestRun(),
  ]);
  // Re-read off the ledger rather than stored: no earlier week changes once it
  // is over, so the run's own week gives back the window it counted over.
  const lastSend = lastRun && {
    weekOf: lastRun.weekOf.toISOString().slice(0, 10),
    newSince: (await digestBaseline(lastRun.startedAt)).since.toISOString(),
    readAt: lastRun.startedAt.toISOString(),
    finishedAt: lastRun.finishedAt?.toISOString() ?? null,
    recipients: lastRun.recipients,
    sent: lastRun.sent,
    failed: lastRun.failed,
  };

  return {
    admins: metric(
      rows.map((r) => ({
        address: r.email,
        receivesDigest: r.staffProfile?.receivesAdminDigest ?? false,
      })),
      "Comptes qui ont le rôle admin dans Jump, désignés par l'adresse avec laquelle chacun se connecte. « receivesDigest » dit si le récapitulatif du lundi lui est envoyé : c'est un choix fait pour chaque administrateur, jamais une conséquence du rôle, et il ne vaut que tant que le compte garde ce rôle.",
    ),
    recipients: metric(
      recipients,
      "Nombre d'administrateurs à qui le prochain récapitulatif du lundi sera envoyé. Zéro signifie qu'aucun récapitulatif ne part.",
    ),
    lastSend: metric(
      lastSend,
      "Dernier récapitulatif du lundi parti, ou null si aucun n'est jamais parti. « weekOf » est le lundi de la semaine qu'il couvre (heure de Paris), « newSince » l'instant à partir duquel il a compté ce qui est nouveau (passé en « since » aux lectures qui le prennent, il redonne les chiffres marqués comme nouveaux dans ce récapitulatif), « readAt » l'instant où il a lu ses chiffres, à partir duquel le récapitulatif suivant comptera ce qui est nouveau s'il a atteint quelqu'un, « finishedAt » l'heure où l'envoi s'est terminé, « recipients » le nombre d'administrateurs à qui il était adressé, « sent » le nombre de mails effectivement partis et « failed » ceux que le service d'envoi a refusés. Un « weekOf » antérieur à la semaine en cours veut dire qu'aucun récapitulatif n'est parti cette semaine : soit aucun destinataire n'est désigné, soit l'envoi n'a pas été déclenché, soit il n'a pas encore fini.",
    ),
  };
}
