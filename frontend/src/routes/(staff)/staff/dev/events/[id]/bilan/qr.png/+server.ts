import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { requireStaffGroup, requireFlag } from '$lib/server/auth/guards';
import { STAGE_FORM_SLUG, feedbackFormPath } from '$lib/domain/feedback';

// On-screen QR for the bilan form. Encodes the AUTHENTICATED feedback link for
// this event, so a talent who scans logs in (if needed) and their answers are
// tied to their Jump account. Rendered server-side and projected full-screen.
export const GET: RequestHandler = async ({ locals, params }) => {
  requireStaffGroup(locals, 'devMember');
  // Same gate as the bilan page and its export: the QR is part of the bilan
  // surface, so a flag-off campus must not be able to project it by direct URL.
  requireFlag(locals, 'bilan');
  const campusId = getCampusId(locals);
  // Validates the event belongs to the acting campus.
  await loadEventOr404(params.id!, campusId);

  const form = await prisma.feedback_Form.findFirst({
    where: {
      slug: STAGE_FORM_SLUG,
      status: 'published',
      allowsAuthenticatedAccess: true,
    },
    select: { slug: true },
  });
  if (!form) throw error(404, 'Formulaire de bilan introuvable.');

  const origin = env.ORIGIN;
  if (!origin) throw error(500, 'ORIGIN is not configured');
  const link = `${origin}${base}${feedbackFormPath(params.id!, form.slug)}`;

  const png = await QRCode.toBuffer(link, {
    width: 1024,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  });
};
