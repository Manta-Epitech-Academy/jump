import { describe, it, expect } from 'vitest';
import {
  defaultEvent,
  defaultEventOfYear,
  eventsOfSchoolYear,
  navigableSchoolYears,
  type DevWorkspaceEvent,
} from './devWorkspace';

type Overrides = Partial<DevWorkspaceEvent> & { id: string; date: string };

/** A navigable event (inscrits reaches with no data gate) unless told otherwise. */
function ev({ id, date, ...rest }: Overrides): DevWorkspaceEvent {
  return {
    id,
    date,
    status: 'past',
    schoolYear: schoolYearOf(date),
    modules: ['inscrits'],
    hasPlanning: false,
    hasFeedbackForm: false,
    hasClosingTemplate: false,
    ...rest,
  };
}

/** Epitech's cycle opens on 31 July; enough for fixtures dated mid-year. */
function schoolYearOf(date: string): { label: string; startYear: number } {
  const [y, m] = date.split('-').map(Number);
  const startYear = m >= 8 ? y : y - 1;
  return { startYear, label: `${startYear}-${startYear + 1}` };
}

describe('defaultEvent', () => {
  it('should prefer the event in progress over one to come and one past', () => {
    // Arrange
    const events = [
      ev({ id: 'past', date: '2025-10-01', status: 'past' }),
      ev({ id: 'live', date: '2025-11-10', status: 'ongoing' }),
      ev({ id: 'next', date: '2025-12-01', status: 'upcoming' }),
    ];
    // Act
    const picked = defaultEvent(events);
    // Assert
    expect(picked?.id).toBe('live');
  });

  it('should pick the earliest of several upcoming events', () => {
    // Arrange
    const events = [
      ev({ id: 'later', date: '2026-03-01', status: 'upcoming' }),
      ev({ id: 'sooner', date: '2026-01-15', status: 'upcoming' }),
    ];
    // Act
    const picked = defaultEvent(events);
    // Assert
    expect(picked?.id).toBe('sooner');
  });

  it('should pick the most recent past event when nothing is live', () => {
    // Arrange
    const events = [
      ev({ id: 'september', date: '2025-09-01' }),
      ev({ id: 'june', date: '2026-06-20' }),
      ev({ id: 'january', date: '2026-01-12' }),
    ];
    // Act
    const picked = defaultEvent(events);
    // Assert
    expect(picked?.id).toBe('june');
  });

  it('should not depend on the order it is given', () => {
    // Arrange
    const events = [
      ev({ id: 'september', date: '2025-09-01' }),
      ev({ id: 'june', date: '2026-06-20' }),
      ev({ id: 'january', date: '2026-01-12' }),
    ];
    const asc = [...events].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    const desc = [...asc].reverse();
    // Act
    const fromAsc = defaultEvent(asc);
    const fromDesc = defaultEvent(desc);
    // Assert
    expect(fromAsc?.id).toBe('june');
    expect(fromDesc?.id).toBe('june');
  });

  it('should order ISO strings and Date objects the same way', () => {
    // Arrange
    const asStrings = [
      ev({ id: 'old', date: '2025-09-01' }),
      ev({ id: 'recent', date: '2026-06-20' }),
    ];
    const asDates = asStrings.map((e) => ({ ...e, date: new Date(e.date) }));
    // Act
    const fromStrings = defaultEvent(asStrings);
    const fromDates = defaultEvent(asDates);
    // Assert
    expect(fromStrings?.id).toBe(fromDates?.id);
    expect(fromDates?.id).toBe('recent');
  });

  it('should return null for an empty set', () => {
    expect(defaultEvent([])).toBeNull();
  });
});

describe('navigableSchoolYears', () => {
  it('should list only years holding an event a dev can open', () => {
    // Arrange
    const events = [
      ev({ id: 'open', date: '2025-10-01' }),
      // Bilan is a module, but its page needs a live feedback form: this event
      // exposes nothing, so its year is not somewhere you can go.
      ev({
        id: 'gated',
        date: '2023-10-01',
        modules: ['bilan'],
        hasFeedbackForm: false,
        hasClosingTemplate: false,
      }),
    ];
    // Act
    const years = navigableSchoolYears(events);
    // Assert
    expect(years).toEqual(['2025-2026']);
  });

  it('should list years most recent first', () => {
    // Arrange
    const events = [
      ev({ id: 'a', date: '2024-10-01' }),
      ev({ id: 'b', date: '2023-11-01' }),
      ev({ id: 'c', date: '2026-02-01' }),
    ];
    // Act
    const years = navigableSchoolYears(events);
    // Assert
    expect(years).toEqual(['2025-2026', '2024-2025', '2023-2024']);
  });
});

describe('defaultEventOfYear', () => {
  it('should resolve a target for every year the menu lists', () => {
    // Arrange
    const events = [
      ev({ id: 'a', date: '2024-10-01' }),
      ev({ id: 'b', date: '2025-11-01' }),
      ev({ id: 'c', date: '2026-05-01' }),
      ev({
        id: 'gated',
        date: '2022-10-01',
        modules: ['bilan'],
        hasFeedbackForm: false,
        hasClosingTemplate: false,
      }),
    ];
    // Act
    const listed = navigableSchoolYears(events);
    // Assert
    expect(listed.length).toBeGreaterThan(0);
    for (const year of listed) {
      expect(defaultEventOfYear(events, year)).not.toBeNull();
    }
    expect(defaultEventOfYear(events, '2022-2023')).toBeNull();
  });

  it('should land on the last event of a finished year', () => {
    // Arrange
    const events = [
      ev({ id: 'rentree', date: '2025-09-15' }),
      ev({ id: 'fin-annee', date: '2026-06-25' }),
      ev({ id: 'autre-annee', date: '2024-11-01' }),
    ];
    // Act
    const picked = defaultEventOfYear(events, '2025-2026');
    // Assert
    expect(picked?.id).toBe('fin-annee');
  });
});

describe('eventsOfSchoolYear', () => {
  it('should keep only the navigable events of that year', () => {
    // Arrange
    const events = [
      ev({ id: 'kept', date: '2025-10-01' }),
      ev({
        id: 'gated',
        date: '2025-11-01',
        modules: ['bilan'],
        hasFeedbackForm: false,
        hasClosingTemplate: false,
      }),
      ev({ id: 'other-year', date: '2024-10-01' }),
    ];
    // Act
    const scoped = eventsOfSchoolYear(events, '2025-2026');
    // Assert
    expect(scoped.map((e) => e.id)).toEqual(['kept']);
  });
});
