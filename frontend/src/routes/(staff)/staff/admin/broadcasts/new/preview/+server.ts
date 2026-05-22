import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { resolveRecipients } from '$lib/server/services/broadcast/recipients';
import { broadcastSchema } from '$lib/validation/broadcasts';

// Live recipient preview for /staff/admin/broadcasts/new. Called from the
// page on every relevant field change (debounced client-side); short-circuits
// quickly when the form is too incomplete to resolve. Returns the same
// `{ total, excluded, sample }` shape the `?/preview` form action emitted.
export const POST: RequestHandler = async ({ request }) => {
  const payload = await request.json().catch(() => null);
  const parsed = broadcastSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.audience) {
    return json({ total: 0, excluded: [], sample: [], incomplete: true });
  }

  const template = await prisma.messageTemplate.findUnique({
    where: { id: parsed.data.templateId },
    select: { channel: true },
  });
  if (!template) throw error(400, 'Template introuvable');

  const { recipients, excluded } = await resolveRecipients(
    {
      campusId: parsed.data.campusId,
      audience: parsed.data.audience,
      eventId: parsed.data.eventId || null,
      filters: parsed.data.filters ?? null,
      sourceBroadcastId: parsed.data.sourceBroadcastId || null,
      sourceFilter: parsed.data.sourceFilter ?? null,
    },
    template.channel,
  );

  return json({
    total: recipients.length,
    excluded,
    sample: recipients.slice(0, 10).map((r) => ({
      name: `${r.prenom} ${r.nom}`.trim(),
      email: r.email,
      phone: r.phone,
    })),
  });
};
