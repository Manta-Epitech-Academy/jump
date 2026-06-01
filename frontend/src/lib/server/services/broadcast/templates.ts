import type { BroadcastChannel, Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';

/**
 * A `MessageTemplate` is *broadcastable* iff it carries no `EmailActionMapping`.
 *
 * Templates wired to an action are transactional (OTP login, relances,
 * account-deletion). They embed per-recipient secrets like `{{otp_code}}`, which
 * `processBroadcast` resolves by minting a real, single-use login code for every
 * recipient (see `buildPersonalization`). Cohort-broadcasting one would therefore
 * mail a working credential to the whole audience.
 *
 * This fragment is the single source of that rule. The composer picker lists by
 * it, and every path that turns a `templateId` into a send resolves through
 * {@link loadBroadcastTemplate}, so the guarantee is enforced server-side rather
 * than only by hiding the option in the picker.
 */
export const BROADCASTABLE_TEMPLATE_WHERE = {
  emailActionMappings: { none: {} },
} satisfies Prisma.MessageTemplateWhereInput;

/** The template fields a broadcast snapshots and sends from. */
export type BroadcastTemplateContent = {
  name: string;
  channel: BroadcastChannel;
  subject: string | null;
  body: string;
};

/**
 * Resolve a template by id, enforcing {@link BROADCASTABLE_TEMPLATE_WHERE}.
 * Returns its send-time content, or `null` when no broadcastable template has
 * that id, whether the id is unknown or it exists but is transactional. Routing
 * the bulk enqueue and the composer test-send through here means a transactional
 * template can never reach a recipient even via a crafted request or a
 * `?template=` deep link that pre-fills an id the picker would have hidden.
 */
export async function loadBroadcastTemplate(
  templateId: string,
): Promise<BroadcastTemplateContent | null> {
  // findFirst, not findUnique: the `emailActionMappings` relation filter is not
  // a unique-where input, and id is unique anyway so at most one row matches.
  return prisma.messageTemplate.findFirst({
    where: { id: templateId, ...BROADCASTABLE_TEMPLATE_WHERE },
    select: { name: true, channel: true, subject: true, body: true },
  });
}
