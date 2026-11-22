import { z } from 'zod';
import { prisma } from '#lib/server/db.ts';
import { gatedQuery } from '#lib/server/remoteFunctions.ts';
import { resolveRecipients } from '#lib/server/services/broadcast/recipients.ts';
import {
  broadcastFiltersSchema,
  broadcastSourceFilterSchema,
} from '#lib/validation/broadcasts.ts';
import {
  BROADCAST_AUDIENCES,
  type IncludedRecipient,
} from '#lib/domain/broadcasts.ts';

/**
 * The targeting the composer previews. Looser than `broadcastSchema`:
 * `templateId` is optional so the count shows before a template is picked (the
 * email/phone exclusion then falls back to the `mail` channel), and nothing
 * about the message itself is asked, since a preview persists nothing.
 */
const targetingSchema = z.object({
  campusId: z.string().min(1),
  audience: z.enum(BROADCAST_AUDIENCES),
  templateId: z.string().optional().or(z.literal('')),
  eventId: z.string().optional().or(z.literal('')),
  sourceBroadcastId: z.string().optional().or(z.literal('')),
  sourceFilter: broadcastSourceFilterSchema.optional(),
  filters: broadcastFiltersSchema.optional(),
});

export type RecipientTargeting = z.input<typeof targetingSchema>;

/**
 * Who a broadcast with this targeting would reach, for the live preview of
 * `/staff/admin/broadcasts/new`: the full, exact roster, never a sample, so the
 * admin sees precisely who is and is not contacted before sending. The send
 * itself resolves the recipients again, on the server.
 */
export const recipientsPreview = gatedQuery(
  { admin: true },
  targetingSchema,
  async (targeting) => {
    let channel: 'mail' | 'sms' = 'mail';
    if (targeting.templateId) {
      const template = await prisma.messageTemplate.findUnique({
        where: { id: targeting.templateId },
        select: { channel: true },
      });
      if (template) channel = template.channel;
    }

    const { recipients, excludedRecipients } = await resolveRecipients(
      {
        campusId: targeting.campusId,
        audience: targeting.audience,
        eventId: targeting.eventId || null,
        filters: targeting.filters ?? null,
        sourceBroadcastId: targeting.sourceBroadcastId || null,
        sourceFilter: targeting.sourceFilter ?? null,
      },
      channel,
    );

    const included: IncludedRecipient[] = recipients.map((r) => ({
      prenom: r.prenom,
      nom: r.nom,
      role: r.role,
      email: r.email,
      phone: r.phone,
    }));
    return {
      total: recipients.length,
      included,
      excluded: excludedRecipients,
    };
  },
);
