import type { RequestHandler } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { niveauLabel } from '$lib/domain/niveau';
import { buildXlsx } from '$lib/server/xlsx';
import {
  presenceSlots,
  slotKey,
  slotLabelLong,
  statusLabelFr,
  effectiveStatus,
  dbDateToKey,
  type CellStatus,
} from '$lib/domain/eventPresence';
import { isSlotPastCutoff } from '$lib/server/presence/slotClosure';
import { PRESENCE_ROSTER_SELECT } from '../components/types';

/**
 * Full-period émargement export: one row per enrolled talent, one column per
 * créneau (≈20 over a 2-week stage), each cell the recorded state (an unmarked
 * talent reads "Absent" once the créneau is closed, "En attente" while it is
 * still open). Always the whole grid (not the on-screen filter), so the file is
 * the complete attendance record for the period.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const timezone = getCampusTimezone(locals);
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  const slots = presenceSlots(event, timezone);

  const now = new Date();
  const [participations, presenceRows, closureRows] = await Promise.all([
    db.participation.findMany({
      where: { eventId: event.id },
      select: PRESENCE_ROSTER_SELECT,
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    db.eventPresence.findMany({
      where: { eventId: event.id },
      select: {
        talentId: true,
        day: true,
        slot: true,
        status: true,
      },
    }),
    db.eventPresenceClosure.findMany({
      where: { eventId: event.id },
      select: { day: true, slot: true },
    }),
  ]);

  // Index stored statuses by talentId|day|slot for O(1) cell lookup.
  const stored = new Map<string, CellStatus>();
  for (const r of presenceRows) {
    stored.set(`${r.talentId}|${dbDateToKey(r.day)}|${r.slot}`, r.status);
  }

  // A créneau is closed by a manual early-close OR once its 11h/15h cutoff has
  // passed; an unmarked talent in a closed créneau exports as absent (the same
  // projection the screen shows), never a stored row.
  const manualClosed = new Set(
    closureRows.map((c) => slotKey(dbDateToKey(c.day), c.slot)),
  );
  const closed = new Set(
    slots
      .filter(
        (s) =>
          manualClosed.has(s.key) ||
          isSlotPastCutoff(s.day, s.slot, timezone, now),
      )
      .map((s) => s.key),
  );

  const rows = participations.map((p) => {
    const t = p.talent;
    const base = [
      t.prenom,
      t.nom,
      t.niveau ? niveauLabel(t.niveau) : '',
      t.phone ?? '',
      t.parentPhone ?? '',
    ];
    const slotCells = slots.map((s) =>
      statusLabelFr(
        effectiveStatus(
          stored.get(`${p.talentId}|${s.day}|${s.slot}`) ?? 'pending',
          closed.has(s.key),
        ),
      ),
    );
    return [...base, ...slotCells];
  });

  const xlsx = buildXlsx({
    name: 'Émargement',
    headers: [
      'Prénom',
      'Nom',
      'Niveau',
      'Tél. élève',
      'Tél. parent',
      ...slots.map(slotLabelLong),
    ],
    rows,
    colWidths: [16, 16, 10, 16, 16, ...slots.map(() => 18)],
  });

  const safeTitle =
    event.titre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim() || 'emargement';

  return new Response(xlsx.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Emargement - ${safeTitle}.xlsx"`,
    },
  });
};
