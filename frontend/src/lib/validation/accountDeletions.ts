import { z } from 'zod';
import { salesforceId18 } from '$lib/domain/salesforce';

// The Salesforce id of a contact erased at their request, copied out of
// Salesforce by the admin who lets the person come back: Jump keeps no way to
// find an erased person by name (`Sync_ErasedContact`). Salesforce shows the
// 15-character spelling in its URLs, Jump holds the 18-character one the API
// returns, so either is taken and the bar is looked up by the second.
export const readmitContactSchema = z.object({
  externalId: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/,
      'Un identifiant Salesforce compte 15 ou 18 caractères, lettres et chiffres.',
    )
    .transform(salesforceId18),
});
