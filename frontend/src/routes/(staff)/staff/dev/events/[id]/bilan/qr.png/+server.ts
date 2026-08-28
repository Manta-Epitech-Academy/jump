import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { getCampusId } from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { resolvePublishedEventForm } from '$lib/server/feedbackForms';
import { feedbackFormPath } from '$lib/domain/feedback';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// On-screen QR for the event's feedback form. Encodes the AUTHENTICATED feedback
// link for this event, so a talent who scans logs in (if needed) and their
// answers are tied to their Jump account. Rendered server-side and projected
// full-screen.
export const GET: RequestHandler = async ({ locals, params }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  // Validates the event belongs to the acting campus and exposes the bilan
  // surface: an event with the module off must not project the QR by direct URL.
  const event = await loadEventOr404(params.id!, campusId);
  requireEventModule(event, EVENT_MODULES.BILAN);

  // Same resolution as the page/export so the QR can never point at a form they
  // wouldn't show (override else type default, published + authenticated).
  const form = await resolvePublishedEventForm(event);
  if (!form) throw error(404, 'Formulaire de feedback introuvable.');

  const origin = env.ORIGIN;
  if (!origin) throw error(500, 'ORIGIN is not configured');
  const link = `${origin}${base}${feedbackFormPath(params.id!, form.slug)}`;

  const png = await QRCode.toBuffer(link, {
    width: 1024,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  recordUsage(USAGE_FEATURES.DEV_BILAN_QR_DISPLAY, {
    locals,
    eventId: params.id,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  });
};
