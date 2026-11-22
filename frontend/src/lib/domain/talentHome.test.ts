import { describe, it, expect } from 'vitest';
import {
  arrivalLabel,
  calendarDaysBetween,
  countdownLabel,
  talentDaysLabel,
  heroEventPhase,
  isInvitationOpen,
  pickHomeHero,
  pointedEventShown,
  type EnrolledEvent,
  type HighlightedEvent,
  type TalentHomeHighlight,
} from './talentHome';
import type { WorkshopActivity } from './workshops';
import { EVENT_MISSING_LABELS } from './eventReadiness';

// An event's first day as the sync stores it: midnight on the campus clock.
const startsOn = (instant: string) => ({ date: new Date(instant) });

describe('isInvitationOpen', () => {
  // 14 October at 00:00 in Paris (CEST, UTC+2).
  const event = startsOn('2026-10-13T22:00:00Z');

  it('invites until the end of the first day, and stops the next', () => {
    // 23:30 in Paris on 14 October.
    expect(
      isInvitationOpen(event, 'Europe/Paris', new Date('2026-10-14T21:30:00Z')),
    ).toBe(true);
    // 00:30 in Paris on 15 October: the event is under way.
    expect(
      isInvitationOpen(event, 'Europe/Paris', new Date('2026-10-14T22:30:00Z')),
    ).toBe(false);
  });

  it('invites to an event still to come', () => {
    expect(
      isInvitationOpen(event, 'Europe/Paris', new Date('2026-10-01T08:00:00Z')),
    ).toBe(true);
  });

  it('reads the day on the campus clock, not on the server’s', () => {
    // 14 October at 00:00 in La Réunion (UTC+4).
    const reunion = startsOn('2026-10-13T20:00:00Z');
    // 20:30 UTC on 14 October is already 15 October in La Réunion.
    expect(
      isInvitationOpen(
        reunion,
        'Indian/Reunion',
        new Date('2026-10-14T20:30:00Z'),
      ),
    ).toBe(false);
    expect(
      isInvitationOpen(
        reunion,
        'Indian/Reunion',
        new Date('2026-10-14T19:30:00Z'),
      ),
    ).toBe(true);
  });
});

describe('pointedEventShown', () => {
  const pointed = {
    campusId: 'paris',
    ...startsOn('2026-10-13T22:00:00Z'),
    publicName: 'Halloween Camp',
    signupUrl: 'https://www.epitech.invalid/inscription',
    devActivatedAt: new Date('2026-09-01T08:00:00Z'),
    modules: ['inscrits'],
  };
  const before = new Date('2026-10-01T08:00:00Z');

  it('shows a named event of the campus, with a form, still inviting', () => {
    expect(pointedEventShown('paris', 'Europe/Paris', pointed, before)).toEqual(
      {
        shown: true,
        name: 'Halloween Camp',
        signupUrl: 'https://www.epitech.invalid/inscription',
      },
    );
  });

  // An unnamed event would invite under its Salesforce title (8de24153).
  it('hides an event with no public name, and says so', () => {
    expect(
      pointedEventShown(
        'paris',
        'Europe/Paris',
        { ...pointed, publicName: '  ' },
        before,
      ),
    ).toEqual({
      shown: false,
      because: "L'événement n'a plus de nom public (publicName).",
    });
  });

  // #516: a talent is shown no event an admin has not activated, nor one left
  // with no section, and the reason names which: an activated event emptied of
  // its sections once read as « not activated » to the admin asking why.
  it('hides an event not shown to talents, saying whether it lacks the activation or a section', () => {
    const because = (event: {
      devActivatedAt?: Date | null;
      modules?: string[];
    }) => {
      const answer = pointedEventShown(
        'paris',
        'Europe/Paris',
        { ...pointed, ...event },
        before,
      );
      return answer.shown ? null : answer.because;
    };
    expect(because({ devActivatedAt: null })).toContain(
      EVENT_MISSING_LABELS.activation,
    );
    expect(because({ modules: [] })).toContain(EVENT_MISSING_LABELS.modules);
    expect(because({ modules: [] })).not.toContain(
      EVENT_MISSING_LABELS.activation,
    );
    // Both missing: the section first, since activating alone shows nothing.
    expect(because({ devActivatedAt: null, modules: [] })).not.toContain(
      EVENT_MISSING_LABELS.activation,
    );
  });
});

describe('heroEventPhase', () => {
  // A camp from 27 to 30 October in Paris (CET after the 25th), arrival 10:00.
  const camp = {
    date: '2026-10-27',
    endDate: '2026-10-30',
    startMinutes: 600,
    timezone: 'Europe/Paris',
  } as const;

  it('waits for the arrival time on the first day', () => {
    // 09:30 in Paris on 27 October.
    expect(heroEventPhase(camp, new Date('2026-10-27T08:30:00Z'), false)).toBe(
      'upcoming',
    );
    // 10:00.
    expect(heroEventPhase(camp, new Date('2026-10-27T09:00:00Z'), false)).toBe(
      'live',
    );
  });

  it('runs as soon as a subject is offered, arrival or not', () => {
    expect(heroEventPhase(camp, new Date('2026-10-27T06:00:00Z'), true)).toBe(
      'live',
    );
  });

  it('runs all day on the days after the first, and ends after the last', () => {
    expect(heroEventPhase(camp, new Date('2026-10-29T05:00:00Z'), false)).toBe(
      'live',
    );
    // 00:30 in Paris on 31 October.
    expect(heroEventPhase(camp, new Date('2026-10-30T23:30:00Z'), false)).toBe(
      'ended',
    );
  });

  it('opens at midnight when no arrival time was set', () => {
    expect(
      heroEventPhase(
        { ...camp, startMinutes: null },
        new Date('2026-10-26T23:30:00Z'),
        false,
      ),
    ).toBe('live');
  });
});

describe('the hero’s words for days and times', () => {
  it('counts campus days to the first one', () => {
    expect(calendarDaysBetween('2026-10-16', '2026-10-27')).toBe(11);
    // Across the change to winter time.
    expect(calendarDaysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(countdownLabel(11)).toBe('J-11');
    expect(countdownLabel(0)).toBe('Aujourd’hui');
  });

  it('names one day, a range, or a range over two months', () => {
    const hero = { knownYear: 2026, weekday: true };
    expect(talentDaysLabel('2026-10-27', null, hero)).toBe('Mardi 27 octobre');
    expect(talentDaysLabel('2026-10-27', '2026-10-30', hero)).toBe(
      'Du 27 au 30 octobre',
    );
    expect(talentDaysLabel('2026-10-30', '2026-11-01', hero)).toBe(
      'Du 30 octobre au 1er novembre',
    );
  });

  it('adds the year only when it is not the one the reader has in mind', () => {
    const hero = { knownYear: 2026, weekday: true };
    expect(talentDaysLabel('2027-01-05', '2027-01-08', hero)).toBe(
      'Du 5 au 8 janvier 2027',
    );
    expect(talentDaysLabel('2026-12-30', '2027-01-02', hero)).toBe(
      'Du 30 décembre au 2 janvier 2027',
    );
  });

  it('names a day without its weekday when asked to', () => {
    expect(
      talentDaysLabel('2025-04-04', null, { knownYear: 2025, weekday: false }),
    ).toBe('4 avril');
  });

  it('writes the arrival time the French way, or nothing', () => {
    expect(arrivalLabel(600)).toBe('10h00');
    expect(arrivalLabel(null)).toBeNull();
  });
});

describe('pickHomeHero', () => {
  const activity = (
    slug: string,
    eventId: string,
    progress: { solved: number; total: number; startedAt: string | null },
  ): WorkshopActivity => ({
    slug,
    eventId,
    slot: null,
    label: slug,
    solvedSteps: progress.solved,
    totalSteps: progress.total,
    startedAt: progress.startedAt ? new Date(progress.startedAt) : null,
    cover: { tagline: null, media: null, poster: null, mascot: null },
  });
  const enrolledIn = (
    id: string,
    date: string,
    endDate: string | null,
    startMinutes: number | null = null,
  ): EnrolledEvent => ({
    id,
    name: id,
    date,
    endDate,
    startMinutes,
    campusName: 'Montpellier',
    timezone: 'Europe/Paris',
    categoryColor: null,
    hasPlanning: false,
    enrolled: { copy: null, image: null },
    live: { copy: null },
  });
  const invitation = {
    title: 'Les Ateliers TECH',
    text: 'Toute l’année, des ateliers gratuits : inscris-toi !',
    url: 'https://www.epitech.invalid/agenda',
    buttonLabel: null,
    image: null,
  };
  const pointedAt = (id: string, date: string): HighlightedEvent => ({
    id,
    name: id,
    date,
    endDate: null,
    startMinutes: null,
    campusName: 'Montpellier',
    timezone: 'Europe/Paris',
    categoryColor: null,
    signupUrl: 'https://www.epitech.invalid/inscription',
    copy: null,
    image: null,
  });

  // Monday 16 November 2026, 11:00 in Paris.
  const now = new Date('2026-11-16T10:00:00Z');
  const stage = enrolledIn('stage', '2026-11-16', '2026-11-20', 540);
  const camp = enrolledIn('camp', '2026-11-27', '2026-11-28', 600);
  const club = enrolledIn('club', '2026-12-02', null);
  const ended = enrolledIn('jpo', '2026-11-14', null);

  const pacman = activity('pacman', 'stage', {
    solved: 3,
    total: 10,
    startedAt: '2026-11-16T08:10:00Z',
  });
  const babel = activity('babel', 'stage', {
    solved: 0,
    total: 8,
    startedAt: null,
  });
  const santa = activity('santa', 'club-octobre', {
    solved: 1,
    total: 30,
    startedAt: '2026-10-03T10:00:00Z',
  });
  const linux = activity('linux', 'club-octobre', {
    solved: 12,
    total: 12,
    startedAt: '2026-10-04T10:00:00Z',
  });
  const both: TalentHomeHighlight = {
    event: pointedAt('camp', '2026-11-27'),
    invitation,
  };

  it('puts every subject of the moment forward as an equal choice', () => {
    const hero = pickHomeHero({
      now,
      enrolled: [camp, stage],
      subjectsNow: [pacman, babel],
      highlight: both,
      activities: [santa],
    });
    expect(hero).toMatchObject({
      kind: 'live',
      event: { id: 'stage' },
      subjects: [pacman, babel],
      copy: { title: null, buttonLabel: 'Accéder au sujet' },
    });
  });

  it('still says the event is on when it offers nothing at this moment', () => {
    expect(
      pickHomeHero({
        now,
        enrolled: [stage],
        subjectsNow: [],
        highlight: both,
        activities: [santa],
      }),
    ).toMatchObject({ kind: 'live', event: { id: 'stage' }, subjects: [] });
  });

  it('prefers, of two running events, the one offering a subject now', () => {
    const club = enrolledIn('club-du-jour', '2026-11-16', null);
    expect(
      pickHomeHero({
        now,
        enrolled: [club, stage],
        subjectsNow: [pacman],
        highlight: null,
        activities: [],
      }),
    ).toMatchObject({ kind: 'live', event: { id: 'stage' } });
  });

  it('tells an enrolled talent they are expected, at the next event', () => {
    expect(
      pickHomeHero({
        now,
        enrolled: [club, camp],
        subjectsNow: [],
        highlight: both,
        activities: [santa],
      }),
    ).toMatchObject({
      kind: 'enrolled',
      event: { id: 'camp' },
      countdownDays: 11,
      copy: {
        title: 'On a hâte de te voir',
        buttonLabel: 'Ajouter à mon agenda',
      },
    });
  });

  it('counts down to « Aujourd’hui » before the arrival on the first day', () => {
    const today = enrolledIn('club-du-soir', '2026-11-16', null, 14 * 60);
    expect(
      pickHomeHero({
        now,
        enrolled: [today],
        subjectsNow: [],
        highlight: null,
        activities: [],
      }),
    ).toMatchObject({ kind: 'enrolled', countdownDays: 0 });
  });

  it('never invites a talent to the event they are enrolled in', () => {
    expect(
      pickHomeHero({
        now,
        enrolled: [camp],
        subjectsNow: [],
        highlight: { event: pointedAt('camp', '2026-11-27'), invitation: null },
        activities: [],
      }),
    ).toMatchObject({ kind: 'enrolled', event: { id: 'camp' } });
  });

  it('invites to the campus’s event a talent not enrolled in it', () => {
    expect(
      pickHomeHero({
        now,
        enrolled: [ended],
        subjectsNow: [],
        highlight: both,
        activities: [santa],
      }),
    ).toMatchObject({
      kind: 'invitation',
      event: { id: 'camp' },
      copy: {
        title: 'camp',
        text: 'Gratuit et ouvert aux débutants : inscris-toi !',
        buttonLabel: 'Je m’inscris',
      },
    });
  });

  it('falls back to the campus’s standing invitation', () => {
    expect(
      pickHomeHero({
        now,
        enrolled: [],
        subjectsNow: [],
        highlight: { event: null, invitation },
        activities: [santa],
      }),
    ).toEqual({ kind: 'generic', invitation, buttonLabel: 'Je m’inscris' });
  });

  it('keeps no thank-you stage: an ended event leaves the hero to the next case', () => {
    expect(
      pickHomeHero({
        now,
        enrolled: [ended],
        subjectsNow: [],
        highlight: null,
        activities: [santa, linux],
      }),
    ).toEqual({ kind: 'continue', activity: santa });
  });

  it('suggests nothing rather than filling the hero', () => {
    expect(
      pickHomeHero({
        now,
        enrolled: [],
        subjectsNow: [],
        highlight: null,
        activities: [linux],
      }),
    ).toBeNull();
  });
});
