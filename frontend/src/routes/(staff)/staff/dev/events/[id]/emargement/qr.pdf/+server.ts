import type { RequestHandler } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { getCampusId, getCampusTimezone } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { resolveSlotCheckinLink } from '$lib/server/presence/slotCheckin';
import { generatePresenceQrPdf } from '$lib/server/presence/qrPdf';
import { dayLabelFr, slotLabelFr } from '$lib/domain/eventPresence';

// Printable A4 émargement sheet for the chosen (day, slot): same signed link as
// the on-screen QR, rendered big for a TV or a wall poster.
export const GET: RequestHandler = async ({ locals, params, url }) => {
  requireStaffGroup(locals, 'devMember');

  const { link, day, slot, eventLabel } = await resolveSlotCheckinLink({
    eventId: params.id!,
    campusId: getCampusId(locals),
    timezone: getCampusTimezone(locals),
    day: url.searchParams.get('day'),
    slot: url.searchParams.get('slot'),
  });

  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 600,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  const pdf = await generatePresenceQrPdf({
    qrDataUrl,
    eventLabel,
    dayLabel: dayLabelFr(day),
    slotLabel: slotLabelFr(slot),
  });

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="emargement-${day}-${slot}.pdf"`,
    },
  });
};
