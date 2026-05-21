/**
 * Send a transactional email by looking up the admin-bound template for
 * the given action key. The whole chain is:
 *
 *   1. Resolve `EmailActionMapping[actionKey] -> MessageTemplate`
 *   2. Substitute `{{variables}}` in subject + body using the provided ctx
 *   3. Render the markdown body to the same branded HTML as broadcasts
 *   4. Send through the active mail provider with our standard envelope
 *
 * When no mapping exists for the action, the call is a no-op (logged as
 * a warning). Admins surface missing mappings in `/staff/admin/email-actions`.
 * Callers don't error — the user-facing flow continues as if the mail had
 * gone out. Trade-off agreed with product: avoid a noisy login error when
 * a deploy ships before an admin configures templates.
 */

import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { sendEmail, MAIL_FROM } from '$lib/server/email';
import {
  substituteVariables,
  EMPTY_VARIABLE_CONTEXT,
  type VariableContext,
} from '$lib/domain/broadcastVariables';
import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
import type { EmailActionKey } from '$lib/domain/emailActions';

export type ActionSendResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: 'no_template' | 'wrong_channel' | 'send_failed';
      message: string;
    };

export async function sendActionEmail(
  actionKey: EmailActionKey,
  recipient: string,
  ctx: Partial<VariableContext>,
): Promise<ActionSendResult> {
  const mapping = await prisma.emailActionMapping.findUnique({
    where: { actionKey },
    select: {
      template: {
        select: { id: true, channel: true, subject: true, body: true },
      },
    },
  });

  if (!mapping) {
    const message = `No template mapped for action "${actionKey}" — skipping send to ${recipient}.`;
    console.warn(`[email-action] ${message}`);
    return { ok: false, reason: 'no_template', message };
  }

  if (mapping.template.channel !== 'mail') {
    const message = `Template bound to action "${actionKey}" has channel "${mapping.template.channel}", expected "mail". Skipping.`;
    console.warn(`[email-action] ${message}`);
    return { ok: false, reason: 'wrong_channel', message };
  }

  const fullCtx: VariableContext = { ...EMPTY_VARIABLE_CONTEXT, ...ctx };
  const subject = substituteVariables(mapping.template.subject ?? '', fullCtx);
  const bodyWithVars = substituteVariables(mapping.template.body, fullCtx);
  const html = renderBroadcastMail(bodyWithVars, env.ORIGIN ?? '');

  const result = await sendEmail({
    from: MAIL_FROM,
    to: recipient,
    subject,
    html,
  });

  if (!result.ok) {
    const message = `${result.reason}: ${result.message}`;
    console.error(`[email-action] Send failed for "${actionKey}":`, message);
    return { ok: false, reason: 'send_failed', message };
  }

  return { ok: true, id: result.id };
}
