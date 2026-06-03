import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { resolveRecipients } from '$lib/server/services/broadcast/recipients';
import {
  broadcastFiltersSchema,
  broadcastSourceFilterSchema,
} from '$lib/validation/broadcasts';
import {
  BROADCAST_AUDIENCES,
  RECIPIENT_ROLE_LABELS,
  RECIPIENT_EXCLUSION_REASON_LABELS,
} from '$lib/domain/broadcasts';
import type { BroadcastAudience, BroadcastSourceFilter } from '@prisma/client';
import { csvResponse } from '$lib/server/csv';

const HEADERS = [
  'Prénom',
  'Nom',
  'Rôle',
  'Email',
  'Téléphone',
  'Statut',
  'Motif',
];

/**
 * Full recipient roster for the composer's current targeting, as a CSV the
 * staff member can review/archive before sending. Included + excluded people
 * (with the reason they're dropped) so the export is exhaustive, not a sample.
 * Params mirror the live preview; `filters` arrives as a JSON-encoded query arg.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.staffProfile) throw error(403, 'Accès refusé.');

  const campusId = url.searchParams.get('campusId') ?? '';
  const audienceRaw = url.searchParams.get('audience') ?? '';
  const date = new Date().toISOString().slice(0, 10);
  const filename = `destinataires-${date}.csv`;

  const audience = BROADCAST_AUDIENCES.includes(
    audienceRaw as BroadcastAudience,
  )
    ? (audienceRaw as BroadcastAudience)
    : null;
  // Incomplete targeting → hand back a valid, empty CSV rather than an error
  // page (the browser is mid-download).
  if (!campusId || !audience) {
    return csvResponse(filename, HEADERS, []);
  }

  let channel: 'mail' | 'sms' = 'mail';
  const templateId = url.searchParams.get('templateId');
  if (templateId) {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: templateId },
      select: { channel: true },
    });
    if (template) channel = template.channel;
  }

  const filtersRaw = url.searchParams.get('filters');
  let filters = null;
  if (filtersRaw) {
    try {
      const parsed = broadcastFiltersSchema.safeParse(JSON.parse(filtersRaw));
      if (parsed.success) filters = parsed.data;
    } catch {
      // Malformed filters param → ignore it (export the unfiltered roster).
    }
  }

  const sourceFilterParsed = broadcastSourceFilterSchema.safeParse(
    url.searchParams.get('sourceFilter'),
  );
  const sourceFilter: BroadcastSourceFilter | null = sourceFilterParsed.success
    ? sourceFilterParsed.data
    : null;

  const { recipients, excludedRecipients } = await resolveRecipients(
    {
      campusId,
      audience,
      eventId: url.searchParams.get('eventId') || null,
      filters,
      sourceBroadcastId: url.searchParams.get('sourceBroadcastId') || null,
      sourceFilter,
    },
    channel,
  );

  const rows: (string | null)[][] = [];
  for (const r of recipients) {
    rows.push([
      r.prenom,
      r.nom,
      RECIPIENT_ROLE_LABELS[r.role],
      r.email,
      r.phone,
      'Recevra',
      '',
    ]);
  }
  for (const e of excludedRecipients) {
    rows.push([
      e.prenom,
      e.nom,
      RECIPIENT_ROLE_LABELS[e.role],
      '',
      '',
      'Exclu',
      RECIPIENT_EXCLUSION_REASON_LABELS[e.reason],
    ]);
  }

  return csvResponse(filename, HEADERS, rows);
};
