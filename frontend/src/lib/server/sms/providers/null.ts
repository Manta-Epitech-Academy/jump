import type { SmsProvider } from '../types';

/**
 * Logs the SMS but doesn't send it. The default until a real provider is
 * wired. Reports a non-retryable failure so the orchestrator / relance loop
 * marks recipients as failed with a clear reason — surfacing an unconfigured
 * deployment instead of a false success.
 */
export const nullSmsProvider: SmsProvider = {
  name: 'null',
  async send({ to, body }) {
    console.log(`[sms:null] to=${to} body=${body.slice(0, 60)}…`);
    return {
      ok: false,
      reason: 'api_error',
      message: 'SMS provider not configured (SMS_PROVIDER=null)',
      statusCode: null,
    };
  },
};
