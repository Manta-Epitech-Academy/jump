import type { BroadcastChannel, Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';

/**
 * A `MessageTemplate` is *broadcastable* iff it carries no `EmailActionMapping`
 * and no `{{otp_code}}`.
 *
 * Templates wired to an action are transactional (OTP login, relances,
 * account-deletion). They embed per-recipient secrets like `{{otp_code}}`, which
 * `processBroadcast` resolves by minting a real, single-use login code for every
 * recipient (see `buildPersonalization`). Cohort-broadcasting one would therefore
 * mail a working credential to the whole audience.
 *
 * The code is excluded on its own, not only through the mapping: re-pointing a
 * login action to a new template (`write_email_action`) unlinks the old one,
 * which still carries the code, and the mapping alone would then let it be
 * broadcast. A subject is optional (an SMS has none), so its clause admits null
 * explicitly: `NOT (subject LIKE ...)` is null on a null subject and would drop
 * every SMS template.
 *
 * This fragment is the single source of that rule. The composer picker lists by
 * it, and every path that turns a `templateId` into a send resolves through
 * {@link loadBroadcastTemplate}, so the guarantee is enforced server-side rather
 * than only by hiding the option in the picker.
 */
export const BROADCASTABLE_TEMPLATE_WHERE = {
  emailActionMappings: { none: {} },
  NOT: { body: { contains: '{{otp_code}}' } },
  OR: [{ subject: null }, { NOT: { subject: { contains: '{{otp_code}}' } } }],
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
