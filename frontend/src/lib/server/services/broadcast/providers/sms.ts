import { env } from '$env/dynamic/private';
import type { SmsProvider, SendOutcome } from './types';

/**
 * Logs the SMS but doesn't actually send. Used as the default until a real
 * provider (Twilio, OVH, etc.) is wired. Always reports success so the
 * orchestrator can finish flows in dev/staging without a paid integration.
 */
export const nullSmsProvider: SmsProvider = {
  async sendSms({ to, body }): Promise<SendOutcome> {
    console.log(`[sms:null] to=${to} body=${body.slice(0, 60)}...`);
    return { ok: true };
  },
};

export function getSmsProvider(): SmsProvider {
  const kind = (env.SMS_PROVIDER ?? 'null').toLowerCase();
  switch (kind) {
    case 'null':
    case '':
      return nullSmsProvider;
    default:
      // Unknown provider name: fail loud so we don't silently lose messages.
      throw new Error(
        `SMS_PROVIDER="${kind}" is not implemented yet. Set SMS_PROVIDER=null or wire a real provider.`,
      );
  }
}
