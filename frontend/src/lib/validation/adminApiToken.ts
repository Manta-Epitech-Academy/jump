import { z } from 'zod';

/**
 * Minting an API token. The label is what the owner will recognise the token by
 * months later, when deciding whether cutting it breaks anything, so it is
 * required rather than optional.
 *
 * `conditionsAccepted` is a deliberate friction point, not decoration: these
 * tokens hand data to an AI client, and the team's RGPD posture rests on the
 * caller knowing they may only use a sanctioned one.
 */
export const createApiTokenSchema = z.object({
  label: z
    .string()
    .trim()
    .min(3, 'Donnez un nom reconnaissable (3 caractères minimum).')
    .max(60, '60 caractères maximum.'),
  conditionsAccepted: z
    .boolean()
    .refine((v) => v, "Vous devez accepter les conditions d'utilisation."),
});
