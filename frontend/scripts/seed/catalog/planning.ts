/**
 * The stage planning, as a shape rather than a schedule.
 *
 * `scripts/seed-stage-planning.ts` holds the real thing: eleven hundred lines of
 * per-campus schedule pinned to real June 2026 dates, provisioned from the
 * campuses' own screenshots. That file is an operational tool and it is left
 * alone. It is deliberately NOT the source for this blueprint, and the reason is
 * that the two need opposite things: the operational script must write the exact
 * dates a campus published, while this generator must write dates relative to
 * `--today` or its scenarios stop meaning what they say. Sharing one table would
 * force one of the two to give that up.
 *
 * So what is carried across is the shape the real schedules share: a two-week
 * stage, ten weekdays, a morning conference, lunch at 12:30, workshops in the
 * afternoon, and a remote « à la carte » day on each Friday.
 *
 * The blueprint covers all six `ActivityType` values on purpose. It is the only
 * place `quiz` and `orga` occur, so dropping one from here would put a hole in
 * the enum coverage the check enforces.
 */

import type { ActivityType } from '@prisma/client';

export type SlotBlueprint = {
  /** Weekday offset from the event's first day, 0-based. */
  readonly day: number;
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly nom: string;
  readonly activityType: ActivityType;
};

const LUNCH = (day: number): SlotBlueprint => ({
  day,
  start: [12, 30],
  end: [13, 30],
  nom: 'Pause déjeuner',
  activityType: 'break',
});

export const STAGE_PLANNING: readonly SlotBlueprint[] = [
  // Semaine 1, découverte.
  {
    day: 0,
    start: [10, 0],
    end: [11, 0],
    nom: 'Accueil',
    activityType: 'orga',
  },
  {
    day: 0,
    start: [11, 0],
    end: [12, 30],
    nom: 'Setting up',
    activityType: 'orga',
  },
  LUNCH(0),
  {
    day: 0,
    start: [13, 30],
    end: [17, 0],
    nom: 'Atelier découverte',
    activityType: 'atelier',
  },

  {
    day: 1,
    start: [10, 0],
    end: [12, 30],
    nom: 'Conférence : les métiers du numérique',
    activityType: 'conference',
  },
  LUNCH(1),
  {
    day: 1,
    start: [13, 30],
    end: [17, 0],
    nom: 'OSINT CTF',
    activityType: 'atelier',
  },

  {
    day: 2,
    start: [10, 0],
    end: [12, 30],
    nom: 'Conférence : cybersécurité',
    activityType: 'conference',
  },
  LUNCH(2),
  {
    day: 2,
    start: [13, 30],
    end: [15, 0],
    nom: 'Shell RPG',
    activityType: 'atelier',
  },
  {
    day: 2,
    start: [15, 0],
    end: [17, 0],
    nom: 'Quiz culture tech',
    activityType: 'quiz',
  },

  {
    day: 3,
    start: [10, 0],
    end: [12, 30],
    nom: 'Pitch projet',
    activityType: 'conference',
  },
  LUNCH(3),
  {
    day: 3,
    start: [13, 30],
    end: [15, 0],
    nom: 'PyPong',
    activityType: 'atelier',
  },
  {
    day: 3,
    start: [15, 0],
    end: [17, 0],
    nom: 'SnakeJS',
    activityType: 'atelier',
  },

  // Vendredi à distance, une seule plage libre.
  {
    day: 4,
    start: [10, 0],
    end: [17, 0],
    nom: 'À la carte !',
    activityType: 'special',
  },

  // Semaine 2, projet.
  {
    day: 5,
    start: [10, 0],
    end: [11, 0],
    nom: 'Conférence : conduite de projet',
    activityType: 'conference',
  },
  {
    day: 5,
    start: [11, 0],
    end: [12, 30],
    nom: 'Kick-off',
    activityType: 'orga',
  },
  LUNCH(5),
  {
    day: 5,
    start: [13, 30],
    end: [17, 0],
    nom: 'Design sprint',
    activityType: 'atelier',
  },

  {
    day: 6,
    start: [10, 0],
    end: [12, 30],
    nom: 'Conférence : design produit',
    activityType: 'conference',
  },
  LUNCH(6),
  {
    day: 6,
    start: [13, 30],
    end: [17, 0],
    nom: 'Maquettage',
    activityType: 'atelier',
  },

  {
    day: 7,
    start: [10, 0],
    end: [12, 30],
    nom: 'Développement',
    activityType: 'atelier',
  },
  LUNCH(7),
  {
    day: 7,
    start: [13, 30],
    end: [17, 0],
    nom: 'Développement',
    activityType: 'atelier',
  },

  {
    day: 8,
    start: [10, 0],
    end: [12, 30],
    nom: 'Répétition des pitchs',
    activityType: 'atelier',
  },
  LUNCH(8),
  {
    day: 8,
    start: [13, 30],
    end: [16, 0],
    nom: 'Finale',
    activityType: 'special',
  },
  {
    day: 8,
    start: [16, 0],
    end: [17, 0],
    nom: 'Remise des prix',
    activityType: 'orga',
  },

  {
    day: 9,
    start: [10, 0],
    end: [17, 0],
    nom: 'À la carte !',
    activityType: 'special',
  },
];

/** A Coding Club is one afternoon: two slots and no lunch. */
export const CODING_CLUB_PLANNING: readonly SlotBlueprint[] = [
  {
    day: 0,
    start: [14, 0],
    end: [15, 30],
    nom: 'Atelier du jour',
    activityType: 'atelier',
  },
  {
    day: 0,
    start: [15, 30],
    end: [17, 0],
    nom: 'Défi en équipes',
    activityType: 'quiz',
  },
];
