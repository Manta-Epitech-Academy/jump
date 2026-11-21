/**
 * The state of every seeded talent's home hero, by the domain's own rule.
 *
 * The hero is computed at request time from three reads (`loadHomeHero`: the
 * talent's shown enrolments, the subjects offered now, what their campus puts
 * forward) and stored nowhere. Those reads are services, which reach
 * `$lib/server/db` and do not resolve outside Vite, so this file reads the same
 * rows in bulk with the client the check pass is given, and hands them to the
 * same domain functions the services do: `selectWorkshopOfferings` and
 * `isOfferedNow` for the subjects, `heroEventPhase` for what is over,
 * `pointedEventShown` for the campus's event, `isEventShown` for the events a
 * talent is shown at all (#516), and `pickHomeHero` for the choice. What it
 * restates is the selection of rows, not a rule.
 *
 * Only what decides the KIND of hero is read: words and pictures change how a
 * state looks, never which one it is.
 */

import type { PrismaClient } from '@prisma/client';
import { eventPublicName } from '../../../src/lib/domain/event';
import {
  getEventStatus,
  getLifecycleBounds,
} from '../../../src/lib/domain/eventLifecycle';
import { dbDateToKey } from '../../../src/lib/domain/eventPresence';
import { isEventShown } from '../../../src/lib/domain/eventReadiness';
import { campusClock, toDateKey } from '../../../src/lib/domain/planningTime';
import {
  heroEventPhase,
  homeHeroState,
  pointedEventShown,
  pickHomeHero,
  type EnrolledEvent,
  type HomeHeroState,
  type TalentHomeHighlight,
} from '../../../src/lib/domain/talentHome';
import {
  isOfferedNow,
  selectWorkshopOfferings,
  type WorkshopActivity,
} from '../../../src/lib/domain/workshops';
import { SEED_ID_PREFIX } from '../ids';

const EVENT_SELECT = {
  id: true,
  titre: true,
  publicName: true,
  date: true,
  endDate: true,
  startMinutes: true,
  campusId: true,
  signupUrl: true,
  devActivatedAt: true,
  modules: { select: { moduleKey: true } },
  campus: { select: { name: true, timezone: true } },
} as const;

/** Every hero state at least one seeded talent is in, at `now`. */
export async function seededHomeHeroStates(
  prisma: PrismaClient,
  now: Date,
): Promise<Set<HomeHeroState>> {
  const seeded = { startsWith: SEED_ID_PREFIX };
  const [enrolments, entries, highlights] = await Promise.all([
    prisma.participation.findMany({
      where: { talentId: seeded },
      select: {
        talentId: true,
        eventId: true,
        shownInDevSpace: true,
        event: {
          select: {
            ...EVENT_SELECT,
            workshops: {
              where: { activity: { enabled: true } },
              select: {
                position: true,
                labelOverride: true,
                day: true,
                slot: true,
                activity: { select: { id: true, slug: true, label: true } },
              },
            },
          },
        },
      },
    }),
    prisma.workshop_Participation.findMany({
      where: { talentId: seeded },
      select: {
        talentId: true,
        activityId: true,
        solvedSteps: true,
        totalSteps: true,
        firstEnteredAt: true,
      },
    }),
    prisma.talentHome_Highlight.findMany({
      select: {
        campusId: true,
        title: true,
        text: true,
        url: true,
        buttonLabel: true,
        campus: { select: { timezone: true } },
        event: { select: EVENT_SELECT },
      },
    }),
  ]);

  const highlightByCampus = new Map<string, TalentHomeHighlight>();
  for (const row of highlights) {
    const pointed = row.event;
    const shown =
      pointed &&
      pointedEventShown(row.campusId, row.campus.timezone, pointed, now);
    const event =
      pointed && shown && shown.shown
        ? {
            ...heroEvent(pointed),
            name: shown.name,
            signupUrl: shown.signupUrl,
            copy: null,
            image: null,
          }
        : null;
    const invitation =
      row.title != null && row.text != null && row.url != null
        ? {
            title: row.title,
            text: row.text,
            url: row.url,
            buttonLabel: row.buttonLabel,
            image: null,
          }
        : null;
    if (event || invitation) {
      highlightByCampus.set(row.campusId, { event, invitation });
    }
  }

  const entriesByTalent = groupBy(entries, (entry) => entry.talentId);
  const states = new Set<HomeHeroState>();
  for (const [talentId, own] of groupBy(enrolments, (e) => e.talentId)) {
    // `resolveTalentCampus`: the campus of the talent's latest event, any
    // event, since it names none.
    const latest = own.reduce((a, b) =>
      b.event.date.getTime() > a.event.date.getTime() ? b : a,
    );
    // `enrolledNotOverWhere` and `offeredWorkshops`: only the events an admin
    // activated are read at all.
    const shown = own.filter(({ event }) => isEventShown(event));
    const enrolled: EnrolledEvent[] = shown
      .filter((enrolment) => enrolment.shownInDevSpace)
      .map(({ event }) => ({
        ...heroEvent(event),
        hasPlanning: false,
        enrolled: { copy: null, image: null },
        live: { copy: null },
      }))
      .filter((event) => heroEventPhase(event, now, false) !== 'ended');

    const started = entriesByTalent.get(talentId) ?? [];
    const offered = selectWorkshopOfferings(
      shown.flatMap(({ eventId, shownInDevSpace, event }) => {
        const timezone = event.campus.timezone;
        const status = getEventStatus(event, getLifecycleBounds(timezone, now));
        const { hour, minute } = campusClock(now, timezone);
        const clock = {
          today: toDateKey(now, timezone),
          minutes: hour * 60 + minute,
        };
        return event.workshops.map((link) => ({
          activityId: link.activity.id,
          eventId,
          eventDate: event.date,
          position: link.position,
          status,
          offeredNow:
            shownInDevSpace &&
            isOfferedNow(
              {
                day: link.day === null ? null : dbDateToKey(link.day),
                slot: link.slot,
              },
              clock,
            ),
          slot: link.slot,
          label: link.labelOverride ?? link.activity.label,
          slug: link.activity.slug,
        }));
      }),
      new Set(started.map((entry) => entry.activityId)),
    );
    const asActivity = (o: (typeof offered)[number]): WorkshopActivity => {
      const entry = started.find((e) => e.activityId === o.activityId);
      return {
        slug: o.slug,
        eventId: o.eventId,
        slot: o.slot,
        label: o.label,
        solvedSteps: entry?.solvedSteps ?? 0,
        totalSteps: entry?.totalSteps ?? 0,
        startedAt: entry?.firstEnteredAt ?? null,
        cover: { tagline: null, media: null, poster: null, mascot: null },
      };
    };

    states.add(
      homeHeroState(
        pickHomeHero({
          now,
          enrolled,
          subjectsNow: offered.filter((o) => o.today).map(asActivity),
          highlight: highlightByCampus.get(latest.event.campusId) ?? null,
          activities: offered.filter((o) => !o.today).map(asActivity),
        }),
      ),
    );
  }
  return states;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

function heroEvent(event: {
  id: string;
  titre: string;
  publicName: string | null;
  date: Date;
  endDate: Date | null;
  startMinutes: number | null;
  campus: { name: string; timezone: string };
}) {
  const timezone = event.campus.timezone;
  return {
    id: event.id,
    name: eventPublicName(event),
    date: toDateKey(event.date, timezone),
    endDate: event.endDate && toDateKey(event.endDate, timezone),
    startMinutes: event.startMinutes,
    campusName: event.campus.name,
    timezone,
    categoryColor: null,
  };
}
