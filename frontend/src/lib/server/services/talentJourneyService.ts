import { prisma } from '$lib/server/db';
import { eventDisplayName } from '$lib/domain/event';
import { getEventStatus, getLifecycleBounds } from '$lib/domain/eventLifecycle';
import { pastEventPresence } from '$lib/domain/sfMemberStatus';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import type {
  TalentJourney,
  TalentJourneyEntry,
} from '$lib/domain/talentJourney';

/**
 * Build a talent's journey: their past events, newest first, each with the
 * closing conducted at it.
 *
 * One query rather than a per-event lookup, and dates are formatted here in the
 * campus timezone so the component never has to know one - the same division of
 * labour as `xpStoryService`.
 *
 * Only the student's own sentence is selected out of the answers. The per-question
 * notes are staff prose about a minor and have no business on a page that is read
 * at a glance; the team's verdict note is here because it IS the team's memory of
 * the person, and the fiche already has a quieter register for staff writing.
 */
export async function getTalentJourney(
  talentId: string,
  timezone: string,
): Promise<TalentJourney> {
  const participations = await prisma.participation.findMany({
    where: { talentId, ...visibleParticipationWhere },
    select: {
      id: true,
      sfMemberStatus: true,
      event: {
        select: {
          id: true,
          titre: true,
          publicName: true,
          date: true,
          endDate: true,
        },
      },
      closing: {
        select: {
          status: true,
          recommendation: true,
          verdictNote: true,
          staff: { select: { user: { select: { name: true, image: true } } } },
          answers: {
            where: { question: { testimonial: true } },
            select: { freeText: true },
          },
        },
      },
    },
    orderBy: { event: { date: 'desc' } },
  });

  const bounds = getLifecycleBounds(timezone);
  const dateLabel = (d: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);

  const isPast = (p: (typeof participations)[number]) =>
    getEventStatus({ date: p.event.date, endDate: p.event.endDate }, bounds) ===
    'past';

  // Past events, and any event a closing has already been conducted at. An event
  // still to come says nothing about who this person is yet, which is the rule
  // this block inherits from the event history it replaces. A conducted closing
  // is the exception, and not a marginal one: a closing happens at the END of an
  // event, so a stage's is finalised while the event still has days to run and a
  // Coding Club's the same afternoon. Past-only would hide the verdict for
  // exactly as long as it is the freshest thing anybody knows about the talent.
  const entries: TalentJourneyEntry[] = participations
    .filter((p) => isPast(p) || p.closing !== null)
    .map((p) => {
      const quote = p.closing?.answers[0]?.freeText?.trim() || null;
      return {
        participationId: p.id,
        eventId: p.event.id,
        eventName: eventDisplayName(p.event),
        dateLabel: dateLabel(p.event.date),
        // Presence is READ OFF the Salesforce status and only means anything once
        // the event is over: on a running event `READY` says "confirmed", not
        // "absent". So an event carried here by its closing alone shows none.
        presence: isPast(p) ? pastEventPresence(p.sfMemberStatus) : null,
        closing: p.closing
          ? {
              status: p.closing.status,
              recommendation: p.closing.recommendation,
              verdictNote: p.closing.verdictNote?.trim() || null,
              quote,
              staffName: p.closing.staff.user?.name?.trim() || null,
              staffImage: p.closing.staff.user?.image ?? null,
            }
          : null,
      };
    });

  return {
    entries,
    eventCount: entries.length,
    closingCount: entries.filter((e) => e.closing?.status === 'done').length,
  };
}
