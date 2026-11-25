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
import type { Prisma } from '@prisma/client';
import { prisma } from '#lib/server/db.ts';
import { shownEnrolmentWhere } from '#lib/domain/eventReadiness.ts';
import { eventPublicName, UNNAMED_EVENT_NAME } from '#lib/domain/event.ts';
import { toDateKey } from '#lib/domain/planningTime.ts';
import {
  arrivalLabel,
  heroEventPhase,
  pickHomeHero,
  type EnrolledEvent,
  type HomeHero,
  type TalentHome,
} from '#lib/domain/talentHome.ts';
import { eventPlace, type HeroCopyWritten } from '#lib/domain/eventHero.ts';
import type { IcsEvent } from '#lib/domain/ics.ts';
import type { TalentWorkshops } from '#lib/domain/workshops.ts';
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
 * The talent's enrolments that count as « inscrit » (shown in the dev space)
 * on an event an admin activated (`shownEventWhere`, #516) that may not be over
 * yet. Coarse on purpose: whether it is over is read on the event's campus
 * clock (`heroEventPhase`), which a `where` cannot do. Shared by the home hero
 * and Mon parcours, so both say « inscrit » about the same events.
 */
export function enrolledNotOverWhere(
  talentId: string,
  now: Date,
): Prisma.ParticipationWhereInput {
  const since = new Date(now.getTime() - ENDED_SLACK_MS);
  return {
    talentId,
    ...shownEnrolmentWhere({
      OR: [
        { endDate: { gte: since } },
        { endDate: null, date: { gte: since } },
      ],
    }),
  };
}

/**
 * The talent's shown enrolments whose event is not over on its campus clock,
 * with what each event wrote for the stages an enrolled talent sees.
 */
export async function listEnrolledHeroEvents(
  talentId: string,
  now: Date = new Date(),
): Promise<EnrolledEvent[]> {
  const enrolments = await prisma.participation.findMany({
    where: enrolledNotOverWhere(talentId, now),
    select: {
      event: {
        select: {
          id: true,
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
        name: eventPublicName(event),
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
  });
  return { hero, workshops, home };
}

/**
 * The calendar entry behind the hero's « Ajouter à mon agenda », for an event
 * this talent is enrolled in (an enrolment the dev space shows, on an event an
 * admin activated: the rules the hero offers it under); null for any other
 * event, so nobody downloads an event they are not expected at. Read on the
 * event's campus clock.
 */
export async function enrolledEventCalendar(
  talentId: string,
  eventId: string,
): Promise<IcsEvent | null> {
  const participation = await prisma.participation.findFirst({
    where: { talentId, eventId, ...shownEnrolmentWhere() },
    select: {
      event: {
        select: {
          id: true,
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
    name: eventPublicName(event) ?? UNNAMED_EVENT_NAME,
    date: toDateKey(event.date, timezone),
    endDate: event.endDate && toDateKey(event.endDate, timezone),
    location: eventPlace(event.campus.name),
    description: arrival ? `Accueil à ${arrival}` : null,
  };
}
