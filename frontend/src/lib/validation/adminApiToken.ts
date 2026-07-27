import { z } from 'zod';

/**
 * Minting an API token. The label is what the owner will recognise the token by
 * months later, when deciding whether cutting it breaks anything, so it is
 * required rather than optional. On a `direction` token it carries more weight
 * still: that token is issued to somebody who has no Jump account, so the label
 * is the only place the holder's name can be recorded.
 *
 * `conditionsAccepted` is a deliberate friction point, not decoration: these
 * tokens hand data to an AI client, and the team's RGPD posture rests on the
 * caller knowing they may only use a sanctioned one.
 *
 * Capabilities are chosen here and never edited afterwards. Re-scoping a
 * credential already sitting in somebody's config file is how a narrow token
 * quietly becomes a wide one, so widening means minting a new one and revoking
 * the old, which both show up in the list and in the log.
 */
export const createApiTokenSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(3, 'Donnez un nom reconnaissable (3 caractères minimum).')
      .max(60, '60 caractères maximum.'),
    tier: z.enum(['core', 'leadership']).default('core'),
    writeEnabled: z.boolean().default(false),
    conditionsAccepted: z
      .boolean()
      .refine((v) => v, "Vous devez accepter les conditions d'utilisation."),
  })
  // Refused rather than silently ignored: somebody who ticked both has
  // misunderstood what a direction token is, and that is worth saying out loud.
  .refine((data) => !(data.tier === 'leadership' && data.writeEnabled), {
    message: 'Un accès direction est en lecture seule.',
    path: ['writeEnabled'],
  });
