import type { SmsProvider } from '../types';

/**
 * Logs that an SMS was dropped, but doesn't send it. The default until a real
 * provider is wired. Reports a non-retryable failure so the orchestrator /
 * relance loop marks recipients as failed with a clear reason, surfacing an
 * unconfigured deployment instead of a false success.
 *
 * The line names neither the number nor any of the text: the body can carry a
 * sign-in code, and the log is out of reach of the RGPD erasure. The broadcast
 * row records which recipient this was.
 */
export const nullSmsProvider: SmsProvider = {
  name: 'null',
  async send({ body }) {
    console.log(`[sms:null] dropped an SMS of ${body.length} characters`);
    return {
      ok: false,
      reason: 'api_error',
      message: 'SMS provider not configured (SMS_PROVIDER=null)',
      statusCode: null,
    };
  },
};
