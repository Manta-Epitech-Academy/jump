import { z } from 'zod';

// The Salesforce id of a contact erased at their request, copied out of
// Salesforce by the admin who lets the person come back: Jump keeps no way to
// find an erased person by name (`Sync_ErasedContact`).
export const readmitContactSchema = z.object({
  externalId: z
    .string()
    .trim()
    .min(1, 'Identifiant requis')
    .max(64, 'Identifiant trop long'),
});
