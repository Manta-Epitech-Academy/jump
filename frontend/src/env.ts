import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * The environment variables the app reads through `$app/env/private` and
 * `$app/env/public`. What each one means, and which environments set it, is
 * written once, in `.env.example` at the repository root.
 *
 * Every variable is read at startup and may be missing: the image is built once
 * with no environment (see the Dockerfile) and the code already handles an unset
 * value, as it did under `$env/dynamic/*`. SvelteKit refuses to start (and to
 * build) when a variable declared without a schema is absent, so `optional`
 * keeps that contract. Making a variable required is a decision of its own, per
 * variable, and not part of declaring it.
 */
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
  BETTER_AUTH_SECRET: { schema: optional },
  BREVO_API_KEY: { schema: optional },
  CRON_SECRET: { schema: optional },
  EMAIL_DEV_RECIPIENTS: { schema: optional },
  JUMP_GAMES_INTERNAL_URL: { schema: optional },
  JUMP_GAMES_SECRET: { schema: optional },
  JUMP_GAMES_URL: { schema: optional },
  LOAD_TEST_SECRET: { schema: optional },
  MAIL_FROM: { schema: optional },
  MAIL_PROVIDER: { schema: optional },
  MAILJET_API_KEY: { schema: optional },
  MAILJET_API_SECRET: { schema: optional },
  MICROSOFT_CLIENT_ID: { schema: optional },
  MICROSOFT_CLIENT_SECRET: { schema: optional },
  MICROSOFT_TENANT_ID: { schema: optional },
  ORIGIN: { schema: optional },
  OUTBOUND_MODE: { schema: optional },
  RESEND_API_KEY: { schema: optional },
  RESEND_FROM_EMAIL: { schema: optional },
  S3_ACCESS_KEY_ID: { schema: optional },
  S3_BUCKET: { schema: optional },
  S3_ENDPOINT: { schema: optional },
  S3_PUBLIC_ENDPOINT: { schema: optional },
  S3_REGION: { schema: optional },
  S3_SECRET_ACCESS_KEY: { schema: optional },
  SMS_DEV_RECIPIENTS: { schema: optional },
  SMS_PROVIDER: { schema: optional },
  SMS_SENDER: { schema: optional },
  USAGE_SALT: { schema: optional },
  WORKER_API_TOKEN: { schema: optional },
  WORKSHOP_TICKET_KEY_ID: { schema: optional },
  WORKSHOP_TICKET_SECRET: { schema: optional },

  PUBLIC_CRISP_WEBSITE_ID: { public: true, schema: optional },
  PUBLIC_UMAMI_WEBSITE_ID: { public: true, schema: optional },
});
