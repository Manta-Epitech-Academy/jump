import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { resolveRecipients } from '$lib/server/services/broadcast/recipients';
import {
  broadcastFiltersSchema,
  broadcastSourceFilterSchema,
} from '$lib/validation/broadcasts';
import {
  BROADCAST_AUDIENCES,
  type IncludedRecipient,
} from '$lib/domain/broadcasts';

// Live recipient preview for /staff/admin/broadcasts/new. Called from the
// page on every relevant field change (debounced client-side). Looser than
// the full `broadcastSchema`: `templateId` is optional so users can see the
// recipient count before they've picked a template: we just fall back to
// `mail` channel for the email/phone exclusion. `name` is dropped entirely
// since this endpoint never persists anything.
const previewSchema = z.object({
  campusId: z.string().min(1),
  audience: z.enum(BROADCAST_AUDIENCES),
  templateId: z.string().optional().or(z.literal('')),
  eventId: z.string().optional().or(z.literal('')),
  sourceBroadcastId: z.string().optional().or(z.literal('')),
  sourceFilter: broadcastSourceFilterSchema.optional(),
  filters: broadcastFiltersSchema.optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.staffProfile) throw error(403, 'Acces refuse.');
  const payload = await request.json().catch(() => null);
  const parsed = previewSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ total: 0, included: [], excluded: [], incomplete: true });
  }

  let channel: 'mail' | 'sms' = 'mail';
  if (parsed.data.templateId) {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: parsed.data.templateId },
      select: { channel: true },
    });
    if (template) channel = template.channel;
  }

  const { recipients, excludedRecipients } = await resolveRecipients(
    {
      campusId: parsed.data.campusId,
      audience: parsed.data.audience,
      eventId: parsed.data.eventId || null,
      filters: parsed.data.filters ?? null,
      sourceBroadcastId: parsed.data.sourceBroadcastId || null,
      sourceFilter: parsed.data.sourceFilter ?? null,
    },
    channel,
  );

  // Full, exact roster (no sampling). The composer renders the whole list so
  // staff see precisely who is (and isn't) contacted before sending.
  const included: IncludedRecipient[] = recipients.map((r) => ({
    prenom: r.prenom,
    nom: r.nom,
    role: r.role,
    email: r.email,
    phone: r.phone,
  }));
  return json({
    total: recipients.length,
    included,
    excluded: excludedRecipients,
  });
};
