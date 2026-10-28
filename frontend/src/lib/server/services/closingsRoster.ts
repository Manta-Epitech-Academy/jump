import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { closingListStatus } from '$lib/domain/closing';
import {
  tallyClosings,
  type ClosingRow,
  type ClosingsRoster,
} from '$lib/domain/closingsRoster';

/**
 * An event's closings roster, as the Closings page lists it and the event home
 * counts it: one row per enrolment the dev space shows, with its closing.
 *
 * The roster comes from `Participation` (Salesforce owns who is enrolled) and
 * the closings alongside it, joined by talent id: a closing keys on
 * (talent, event) rather than hanging off a participation row, so the sync
 * pruning an enrolment can no longer take a conducted closing with it. Same
 * shape the émargement screens already use. The tallies are derived from rows
 * already in memory (a stage cohort is ~200).
 */
export async function loadClosingsRoster(
  db: ScopedPrismaClient,
  eventId: string,
): Promise<ClosingsRoster> {
  const [participations, closings] = await Promise.all([
    db.participation.findMany({
      // Same cohort definition as every other dev screen. This was the one
      // roster built without it, which nothing could show while every
      // `sfMemberStatus` was null: as soon as the sync writes a status, a
      // withdrawn member would be listed for a closing here and absent from
      // the inscrits list of the same event.
      where: { eventId, ...visibleParticipationWhere },
      select: {
        talentId: true,
        talent: { select: { nom: true, prenom: true } },
      },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    db.closing_Record.findMany({
      where: { eventId },
      select: {
        talentId: true,
        status: true,
        conductedAt: true,
        recommendation: true,
        staff: {
          select: {
            id: true,
            user: { select: { name: true, image: true } },
          },
        },
      },
    }),
  ]);

  const closingOf = new Map(closings.map((c) => [c.talentId, c]));
  const rows: ClosingRow[] = participations.map((p) => {
    const closing = closingOf.get(p.talentId) ?? null;
    return {
      talentId: p.talentId,
      nom: p.talent.nom,
      prenom: p.talent.prenom,
      status: closingListStatus(closing),
      staffName: closing?.staff?.user?.name ?? null,
      staffImage: closing?.staff?.user?.image ?? null,
      conductedAt: closing?.conductedAt ?? null,
      recommendation: closing?.recommendation ?? null,
    };
  });

  return { rows, ...tallyClosings(rows), total: rows.length };
}
