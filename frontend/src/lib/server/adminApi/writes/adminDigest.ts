/**
 * Who receives the Monday digest, one admin at a time.
 *
 * Class A: bounded to one admin's own choice, reversible by writing the opposite,
 * and it sends nothing (the digest goes out on its schedule, to whoever is chosen
 * then). It chooses only among admins, named by the address they log in with,
 * never an arbitrary address: every link in the digest needs a staff session, and
 * a write that took any address would let a model aim the weekly operations mail
 * anywhere. The rule it writes for is `services/adminStats/adminDigestRecipients.ts`'s.
 */

import { prisma } from '$lib/server/db';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import type { WriteOutcome } from '../plan';

type RecipientState = { address: string; receivesDigest: boolean };

export async function writeAdminDigestRecipient(params: {
  address: string;
  receivesDigest: boolean;
}): Promise<WriteOutcome> {
  const address = params.address.trim();
  const admin = await prisma.bauth_user.findFirst({
    where: {
      email: { equals: address, mode: 'insensitive' },
      staffProfile: { staffRole: 'admin' },
    },
    select: {
      id: true,
      email: true,
      staffProfile: { select: { receivesAdminDigest: true } },
    },
  });
  if (!admin?.staffProfile)
    throw new OperationRefusedError(
      `« ${address} » n'est l'adresse d'aucun administrateur de Jump : le récapitulatif ne part qu'à un compte qui a le rôle admin. ${handleProvenanceFr('adminAddress')}`,
    );

  const before: RecipientState = {
    address: admin.email,
    receivesDigest: admin.staffProfile.receivesAdminDigest,
  };
  await prisma.staffProfile.update({
    where: { userId: admin.id },
    data: { receivesAdminDigest: params.receivesDigest },
  });
  const after: RecipientState = {
    address: admin.email,
    receivesDigest: params.receivesDigest,
  };
  return { applied: true, before, after };
}
