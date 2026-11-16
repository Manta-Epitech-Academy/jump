/**
 * What the blue hero at the head of a talent's home needs, read in one place:
 * the events the talent is enrolled in that are not over, the subjects offered
 * right now, and what their campus puts forward. The choice among them is one
 * pure rule, `pickHomeHero` in `domain/talentHome.ts`.
 *
 * « Enrolled » is an enrolment the dev space shows (`visibleParticipationWhere`,
 * the PO's rule of 02/11/2026, #491): a talent who withdrew, or whose
 * Salesforce status the event masks, is not expected there, so the hero never
 * says « on a hâte de te voir » to them, and invites them like anyone else.
 * Every day and hour is read on the event's own campus clock, never on the
 * browser's.
 */
import { prisma } from '$lib/server/db';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { eventDisplayName } from '$lib/domain/event';
import { toDateKey } from '$lib/domain/planningTime';
import {
  arrivalLabel,
  heroEventPhase,
  pickHomeHero,
  type EnrolledEvent,
  type HomeHero,
  type TalentHome,
} from '$lib/domain/talentHome';
import { eventPlace, type HeroCopyWritten } from '$lib/domain/eventHero';
import type { IcsEvent } from '$lib/domain/ics';
import type { TalentWorkshops } from '$lib/domain/workshops';
import { listTalentWorkshops } from './workshopService';
import { getTalentHome } from './talentHomeService';
import { shownEventHeroPicture } from './eventHeroImages';

/**
 * A day and a half of slack on the database side: an event's last day is
 * stored at 23:59 on its campus clock, a single day at its 00:00, and the exact
 * "is it over" is answered on that clock by `heroEventPhase` below.
 */
const ENDED_SLACK_MS = 36 * 60 * 60 * 1000;

/**
 * The talent's shown enrolments whose event is not over on its campus clock,
 * with what each event wrote for the stages an enrolled talent sees.
 */
export async function listEnrolledHeroEvents(
  talentId: string,
  now: Date = new Date(),
): Promise<EnrolledEvent[]> {
  const since = new Date(now.getTime() - ENDED_SLACK_MS);
  const enrolments = await prisma.participation.findMany({
    where: {
      talentId,
      ...visibleParticipationWhere,
      event: {
        OR: [
          { endDate: { gte: since } },
          { endDate: null, date: { gte: since } },
        ],
      },
    },
    select: {
      event: {
        select: {
          id: true,
          titre: true,
          publicName: true,
          date: true,
          endDate: true,
          startMinutes: true,
          campus: { select: { name: true, timezone: true } },
          category: { select: { color: true } },
          planningSlots: {
            where: { activityType: { not: 'orga' } },
            select: { id: true },
            take: 1,
          },
          heroes: {
            where: { stage: { in: ['enrolled', 'live'] } },
            select: {
              stage: true,
              title: true,
              text: true,
              buttonLabel: true,
              image: {
                select: {
                  key: true,
                  stillKey: true,
                  width: true,
                  height: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return enrolments
    .map(({ event }): EnrolledEvent => {
      const timezone = event.campus.timezone;
      const stage = (name: 'enrolled' | 'live') =>
        event.heroes.find((hero) => hero.stage === name);
      const words = (name: 'enrolled' | 'live'): HeroCopyWritten | null => {
        const row = stage(name);
        return row
          ? { title: row.title, text: row.text, buttonLabel: row.buttonLabel }
          : null;
      };
      const picture = stage('enrolled')?.image;
      return {
        id: event.id,
        name: eventDisplayName(event),
        date: toDateKey(event.date, timezone),
        endDate: event.endDate && toDateKey(event.endDate, timezone),
        startMinutes: event.startMinutes,
        campusName: event.campus.name,
        timezone,
        categoryColor: event.category?.color ?? null,
        hasPlanning: event.planningSlots.length > 0,
        enrolled: {
          copy: words('enrolled'),
          image: picture ? shownEventHeroPicture(picture) : null,
        },
        live: { copy: words('live') },
      };
    })
    .filter((event) => heroEventPhase(event, now, false) !== 'ended');
}

/** The home's hero, with what the rest of the page reads from the same loads. */
export async function loadHomeHero(
  talentId: string,
  campusId: string | null,
  now: Date = new Date(),
): Promise<{
  hero: HomeHero | null;
  workshops: TalentWorkshops;
  home: TalentHome;
}> {
  const [enrolled, workshops, home] = await Promise.all([
    listEnrolledHeroEvents(talentId, now),
    listTalentWorkshops(talentId, now),
    getTalentHome(campusId, now),
  ]);
  const hero = pickHomeHero({
    now,
    enrolled,
    subjectsNow: workshops.today,
    highlight: home.highlight,
    activities: workshops.activities,
  });
  return { hero, workshops, home };
}

/**
 * The calendar entry behind the hero's « Ajouter à mon agenda », for an event
 * this talent is enrolled in (an enrolment the dev space shows, the rule the
 * hero offers it under); null for any other event, so nobody downloads an
 * event they are not expected at. Read on the event's campus clock.
 */
export async function enrolledEventCalendar(
  talentId: string,
  eventId: string,
): Promise<IcsEvent | null> {
  const participation = await prisma.participation.findFirst({
    where: { talentId, eventId, ...visibleParticipationWhere },
    select: {
      event: {
        select: {
          id: true,
          titre: true,
          publicName: true,
          date: true,
          endDate: true,
          startMinutes: true,
          campus: { select: { name: true, timezone: true } },
        },
      },
    },
  });
  if (!participation) return null;
  const { event } = participation;
  const timezone = event.campus.timezone;
  const arrival = arrivalLabel(event.startMinutes);
  return {
    id: event.id,
    name: eventDisplayName(event),
    date: toDateKey(event.date, timezone),
    endDate: event.endDate && toDateKey(event.endDate, timezone),
    location: eventPlace(event.campus.name),
    description: arrival ? `Accueil à ${arrival}` : null,
  };
}
