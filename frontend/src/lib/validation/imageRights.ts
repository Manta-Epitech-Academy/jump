import { z } from 'zod';
import { ImageRightsDecision } from '@prisma/client';

/**
 * Staff correction of a guardian's image-rights decision, recorded on their
 * behalf after an offline change of mind (a phone call or email). Kept to the
 * minimum staff actually decide: the new decision, the guardian it is attributed
 * to (pre-filled from the talent), and a mandatory `note` — a staff write
 * standing in for the guardian must say why, so the ledger fact is
 * self-explaining in an audit. Relationship and place-of-signature are carried
 * over from the prior decision server-side (both default cleanly in the PDF), so
 * staff never re-key them for a phone correction.
 */
export const imageRightsCorrectionSchema = z.object({
  decision: z.enum(ImageRightsDecision),
  signerPrenom: z.string().trim().min(1, 'Prénom du responsable légal requis'),
  signerNom: z.string().trim().min(1, 'Nom du responsable légal requis'),
  note: z.string().trim().min(1, 'Motif de la correction requis'),
});

export type ImageRightsCorrectionSchema = typeof imageRightsCorrectionSchema;
