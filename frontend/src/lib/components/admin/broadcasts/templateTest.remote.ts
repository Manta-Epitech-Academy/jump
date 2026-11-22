import { z } from 'zod';
import { BROADCAST_CHANNELS } from '#lib/domain/broadcasts.ts';
import { USAGE_FEATURES } from '#lib/domain/usage.ts';
import { gatedCommand } from '#lib/server/remoteFunctions.ts';
import { sendTestMessage } from '#lib/server/services/broadcast/testMessage.ts';
import { recordUsage } from '#lib/server/usage/record.ts';

/**
 * Live test-send for the template editor (`TemplateForm`, on
 * `/broadcasts/templates/new` and `[id]`). Sends the in-progress draft, no
 * saved template needed, rendered with demo variables: the same as
 * `/broadcasts/new`'s test send, keyed on the editor content instead of a
 * template id.
 */
export const sendTemplateTest = gatedCommand(
  { admin: true },
  z.object({
    channel: z.enum(BROADCAST_CHANNELS),
    subject: z.string().nullish(),
    body: z.string().min(1),
    to: z.string().min(1),
  }),
  (draft, { locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_BROADCAST_TEST_SEND, { locals });
    return sendTestMessage({ ...draft, subject: draft.subject ?? null });
  },
);
