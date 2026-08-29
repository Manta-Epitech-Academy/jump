import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { eventDisplayName } from '$lib/domain/event';
import { EVENT_MODULES, eventHasModule } from '$lib/domain/eventModules';
import { isDevVisibleEvent } from '$lib/server/services/stageContext';
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
 * Two queries, not a per-event lookup - participations and closings, unioned in
 * memory rather than joined in SQL, because a closing keys on (talent, event)
 * and can no longer be reached through a participation row once the Salesforce
 * sync has pruned it. Dates are formatted here in the campus timezone so the
 * component never has to know one - the same division of labour as
 * `xpStoryService`. Where an event's name leads is resolved here for the same
 * reason: reachability is a fact about the event and the reader's campus, and
 * the component has neither.
 *
 * Only the student's own sentence is selected out of the answers. The per-question
 * notes are staff prose about a minor and have no business on a page that is read
 * at a glance; the team's verdict note is here because it IS the team's memory of
 * the person, and the fiche already has a quieter register for staff writing.
 */
// What decides whether the event's name is a link: the reader's own campus,
// whether the event is in the dev workspace at all, and the module the
// destination is gated on. Read here rather than left to the component, which
// has no way to ask. Shared by both queries below: a closing that has outlived
// its participation still names an event, and it is the same event shape
// either way.
const JOURNEY_EVENT_SELECT = {
  id: true,
  titre: true,
  publicName: true,
  date: true,
  endDate: true,
  campusId: true,
  devActivatedAt: true,
  modules: { select: { moduleKey: true } },
} as const;

/** What `JOURNEY_EVENT_SELECT` fetches, named once for the helpers below that
 *  read it regardless of which side of the union (participation or closing)
 *  carried it. */
type JourneyEvent = {
  id: string;
  titre: string;
  publicName: string | null;
  date: Date;
  endDate: Date | null;
  campusId: string;
  devActivatedAt: Date | null;
  modules: { moduleKey: string }[];
};

export async function getTalentJourney(
  talentId: string,
  campusId: string,
  timezone: string,
): Promise<TalentJourney> {
  // Two independent reads rather than one include: a closing keys on
  // (talent, event), not on a participation row, precisely so the Salesforce
  // sync pruning an enrolment cannot take a conducted closing with it - and
  // that closing must still be able to name its own event once the
  // participation naming it is gone. Joined back by event id below.
  const [participations, closings] = await Promise.all([
    prisma.participation.findMany({
      where: { talentId, ...visibleParticipationWhere },
      select: {
        eventId: true,
        sfMemberStatus: true,
        event: { select: JOURNEY_EVENT_SELECT },
      },
    }),
    prisma.closing_Record.findMany({
      where: { talentId },
      select: {
        eventId: true,
        status: true,
        recommendation: true,
        verdictNote: true,
        staff: { select: { user: { select: { name: true, image: true } } } },
        answers: {
          where: { question: { testimonial: true } },
          select: { freeText: true },
        },
        event: { select: JOURNEY_EVENT_SELECT },
      },
    }),
  ]);
  const participationOf = new Map(participations.map((p) => [p.eventId, p]));
  const closingOf = new Map(closings.map((c) => [c.eventId, c]));

  // The event's Inscrits list, when the reader can actually open it: same campus
  // (`loadEventOr404`), a member of the dev workspace (`isDevVisibleEvent`), and
  // the module that gates the page (`requireEventModule`).
  // Withholding the link rather than pointing at another surface is deliberate -
  // an event with no Inscrits list has nothing this page was sending them to
  // read, and "the first surface it happens to expose" is a different question
  // (`landingSurface`), asked by the workspace, which knows the event.
  //
  // The row itself stays, link or no link: what somebody attended is a fact
  // about that person, and dropping the events an admin has not activated would
  // make this section - and the counts in its header - describe the workspace's
  // configuration rather than the talent's history.
  const eventHref = (event: JourneyEvent): string | null => {
    if (event.campusId !== campusId) return null;
    if (!isDevVisibleEvent(event)) return null;
    const modules = event.modules.map((m) => m.moduleKey);
    if (!eventHasModule(modules, EVENT_MODULES.INSCRITS)) return null;
    return resolve(`/staff/dev/events/${event.id}/inscrits`);
  };

  const bounds = getLifecycleBounds(timezone);
  const dateLabel = (d: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);

  const isPast = (event: JourneyEvent) =>
    getEventStatus({ date: event.date, endDate: event.endDate }, bounds) ===
    'past';

  // Every event the talent was enrolled in, plus every event a closing was
  // conducted at, unioned rather than the first alone: a closing with no
  // participation left to join it is exactly a closing whose enrolment the
  // Salesforce sync has since pruned, and it must stay on this list for that
  // reason, not fall off it - being un-deletable in the database and being
  // shown here are the same guarantee, not two.
  const eventIds = new Set([...participationOf.keys(), ...closingOf.keys()]);

  // Past events, and any event a closing has already been conducted at. An event
  // still to come says nothing about who this person is yet, which is the rule
  // this block inherits from the event history it replaces. A conducted closing
  // is the exception, and not a marginal one: a closing happens at the END of an
  // event, so a stage's is finalised while the event still has days to run and a
  // Coding Club's the same afternoon. Past-only would hide the verdict for
  // exactly as long as it is the freshest thing anybody knows about the talent.
  const entries: TalentJourneyEntry[] = [...eventIds]
    .map((eventId) => {
      const participation = participationOf.get(eventId) ?? null;
      const closing = closingOf.get(eventId) ?? null;
      // Either side can name the event: a participation, or (once it has been
      // pruned) the closing itself, which carries its own for this reason.
      const event = (participation ?? closing)!.event;
      return {
        eventId,
        event,
        sfMemberStatus: participation?.sfMemberStatus ?? null,
        closing,
      };
    })
    .filter(({ event, closing }) => isPast(event) || closing !== null)
    .sort((a, b) => b.event.date.getTime() - a.event.date.getTime())
    .map(({ eventId, event, sfMemberStatus, closing }) => {
      const quote = closing?.answers[0]?.freeText?.trim() || null;
      return {
        eventId,
        eventName: eventDisplayName(event),
        eventHref: eventHref(event),
        dateLabel: dateLabel(event.date),
        // Presence is READ OFF the Salesforce status and only means anything once
        // the event is over: on a running event `READY` says "confirmed", not
        // "absent". So an event carried here by its closing alone - its own
        // participation since pruned - has no status to read and shows none.
        presence: isPast(event) ? pastEventPresence(sfMemberStatus) : null,
        closing: closing
          ? {
              status: closing.status,
              recommendation: closing.recommendation,
              verdictNote: closing.verdictNote?.trim() || null,
              quote,
              staffName: closing.staff?.user?.name?.trim() || null,
              staffImage: closing.staff?.user?.image ?? null,
            }
          : null,
      };
    });

  return {
    talentId,
    entries,
    eventCount: entries.length,
    closingCount: entries.filter((e) => e.closing?.status === 'done').length,
  };
}
