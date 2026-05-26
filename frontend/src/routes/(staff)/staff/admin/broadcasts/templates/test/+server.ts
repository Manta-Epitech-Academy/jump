import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { BROADCAST_CHANNELS } from '$lib/domain/broadcasts';
import { sendTestMessage } from '$lib/server/services/broadcast/testMessage';

// Live test-send for the template editor (/broadcasts/templates/new + [id]).
// Sends the in-progress draft — no saved template needed — rendered with demo
// variables, exactly like /broadcasts/new's "test send" but keyed on the
// editor content instead of a templateId. Admin-only access is enforced by
// `applyRouteGuards` in hooks.server.ts (the `/staff/admin/*` sub-guard runs
// for endpoints too — layout loads do NOT); the `locals.user` check below is
// belt-and-braces, not the primary gate.
const testSchema = z.object({
  channel: z.enum(BROADCAST_CHANNELS),
  subject: z.string().nullish(),
  body: z.string().min(1),
  to: z.string().min(1),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ ok: false, message: 'Non autorisé.' }, { status: 401 });
  }
  const payload = await request.json().catch(() => null);
  const parsed = testSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ ok: false, message: 'Données invalides.' }, { status: 400 });
  }
  const result = await sendTestMessage({
    channel: parsed.data.channel,
    subject: parsed.data.subject ?? null,
    body: parsed.data.body,
    to: parsed.data.to,
  });
  return json(result, { status: result.ok ? 200 : 400 });
};
