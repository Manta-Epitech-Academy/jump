import type { RequestHandler } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { getCampusId, getCampusTimezone } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { resolveSlotCheckinLink } from '$lib/server/presence/slotCheckin';

// On-screen QR for the chosen (day, slot). Rendered server-side so the signed
// check-in link never reaches the staff page's JS; the dialog just points an
// <img> here. Same stable link as the printable PDF.
export const GET: RequestHandler = async ({ locals, params, url }) => {
  requireStaffGroup(locals, 'devMember');

  const { link } = await resolveSlotCheckinLink({
    eventId: params.id!,
    campusId: getCampusId(locals),
    timezone: getCampusTimezone(locals),
    day: url.searchParams.get('day'),
    slot: url.searchParams.get('slot'),
  });

  // 1024px so it stays crisp when the dialog blows it up to a full-screen
  // presentation on a TV / projector.
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
