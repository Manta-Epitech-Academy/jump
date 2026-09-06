import { env } from '$env/dynamic/private';
import {
  substituteVariables,
  buildDemoContext,
} from '$lib/domain/broadcastVariables';
import { renderBroadcastEmail } from '$lib/domain/broadcastMarkdown';
import { rewriteHtmlLinks, rewriteSmsLinks } from './linkRewriter';
import { sendEmail, MAIL_FROM } from '$lib/server/email';
import { sendSms } from '$lib/server/sms';
import { toBrevoRecipient } from '$lib/domain/phone';

const TEST_TRACKING_ID = 'TEST_TRACKING_ID';
const EMAIL_RE = /^\S+@\S+\.\S+$/;

export type TestMessageInput = {
  channel: 'mail' | 'sms';
  subject: string | null;
  body: string;
  /** Raw recipient: an email address (mail) or phone number (sms). */
  to: string;
  /** Optional event title, for the {{event_name}} demo variable. */
  eventName?: string | null;
};

export type TestMessageResult = { ok: true } | { ok: false; message: string };

/**
 * Render a template's content with demo variables and send it to a single
 * test recipient. Shared by the broadcast composer (test a saved template by
 * id) and the template editor (test the in-progress draft), so both surfaces
 * render and track links identically to a real send, the only differences
 * from production are the demo variable values and the fixed tracking id.
 *
 * A test-send addresses one recipient the staff member just typed (or their
 * own address), so it `devRedirect: 'bypass'`-es the env trap: on dev/staging
 * the preview reaches the address you entered instead of being rerouted to the
 * shared `*_DEV_RECIPIENTS` list. That's what makes "send me a real test" work
 * without a redeploy. The trap still governs every bulk and automatic send:
 * only this single, explicit, human-typed path opts out.
 */
export async function sendTestMessage(
  input: TestMessageInput,
): Promise<TestMessageResult> {
  const ctx = buildDemoContext(input.eventName ?? null);

  if (input.channel === 'sms') {
    const recipient = toBrevoRecipient(input.to);
    if (!recipient) return { ok: false, message: 'Numéro de test invalide.' };
    // SMS links are sent verbatim (no tracking suffix); see the SMS path in
    // the orchestrator. Mirror that here so the test matches a real send.
    const body = substituteVariables(input.body, ctx);
    const result = await sendSms(
      { to: recipient, body },
      { devRedirect: 'bypass' },
    );
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  }

  const to = input.to.trim();
  if (!EMAIL_RE.test(to)) {
    return { ok: false, message: 'Email de test invalide.' };
  }
  const subject = input.subject
    ? `[TEST] ${substituteVariables(input.subject, ctx)}`
    : '[TEST] Envoi en masse';
  const rendered = renderBroadcastEmail(
    substituteVariables(input.body, ctx),
    env.ORIGIN ?? '',
    subject,
  );
  const html = rewriteHtmlLinks(rendered.html, TEST_TRACKING_ID);
  const text = rewriteSmsLinks(rendered.text, TEST_TRACKING_ID);
  const result = await sendEmail(
    { from: MAIL_FROM, to, subject, html, text },
    { devRedirect: 'bypass' },
  );
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}
