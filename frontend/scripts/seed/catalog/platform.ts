/**
 * Platform-wide referentials that are not talent data: the minigame rotation,
 * the XP reward catalogue, per-campus signatories, and the event configuration
 * templates the config wizard applies.
 *
 * The minigame slugs are NOT invented. jump-games owns that catalogue and jump
 * reads it live from its `GET /api/games`; the seed cannot reach the service, so
 * it mirrors the seven slugs jump-games actually publishes today. If that list
 * ever diverges, the wrong thing to do is to make one up here: read the real one
 * from `jump-games/src/lib/games/catalog.ts` and copy it across.
 */

import type { MinigameScoring } from '@prisma/client';

export type MinigameSpec = {
  readonly game: string;
  readonly gameName: string;
  readonly levels: number;
  readonly scoringType: MinigameScoring;
  /** Rotation weight, curated by the host in `MinigameConfig`. */
  readonly weight: number;
};

export const MINIGAMES: readonly MinigameSpec[] = [
  {
    game: 'minesweeper',
    gameName: 'Démineur',
    levels: 3,
    scoringType: 'chrono',
    weight: 1,
  },
  {
    game: 'tango',
    gameName: 'Tango',
    levels: 4,
    scoringType: 'chrono',
    weight: 2,
  },
  {
    game: 'mini-sudoku',
    gameName: 'Mini Sudoku',
    levels: 3,
    scoringType: 'chrono',
    weight: 1,
  },
  {
    game: 'pinpoint',
    gameName: 'Pinpoint',
    levels: 5,
    scoringType: 'chrono',
    weight: 3,
  },
  {
    game: 'patches',
    gameName: 'Patches',
    levels: 3,
    scoringType: 'chrono',
    weight: 1,
  },
  { game: 'zip', gameName: 'Zip', levels: 4, scoringType: 'chrono', weight: 2 },
  // jump-games publishes only chrono-ranked games today, so `score` has no
  // production example. It is seeded anyway: the enum, the publication snapshot
  // and the ranking all still support it, and a branch with no row is a branch
  // nobody can look at. A deliberate departure from PROFILE.md.
  {
    game: 'queens',
    gameName: 'Queens',
    levels: 4,
    scoringType: 'score',
    weight: 2,
  },
];

/**
 * Rewards granted from a scoreboard, which is where the largest XP amounts in
 * production come from: `reward` alone accounts for 1.19M of the 1.62M XP
 * granted, with individual grants up to 1800. A generator that only ever grants
 * the flat onboarding 200 and minigame 50 produces a leaderboard nobody would
 * recognise.
 */
export type XpRewardSpec = {
  readonly key: string;
  readonly name: string;
  /** Null means the amount varies per talent, which is the scoreboard case. */
  readonly xpAmount: number | null;
};

export const XP_REWARDS: readonly XpRewardSpec[] = [
  {
    key: 'ctf_shell_2026',
    name: 'CTF Shell - classement final',
    xpAmount: null,
  },
  {
    key: 'ctf_osint_2026',
    name: 'CTF OSINT - classement final',
    xpAmount: null,
  },
  { key: 'projet_stage_2nde', name: 'Projet de fin de stage', xpAmount: 800 },
  { key: 'quiz_culture_tech', name: 'Quiz culture tech', xpAmount: 150 },
  {
    key: 'presence_assidue',
    name: 'Assiduité sur toute la période',
    xpAmount: 300,
  },
];

/**
 * Signatories are per-campus and used on issued documents. Production carries 18
 * of them across the 15 campuses, so a couple of campuses have two: one campus
 * director and one national signature. The generator reproduces that rather than
 * one-per-campus, because a document template picking "the" signatory is exactly
 * the assumption that breaks on the campuses that have two.
 */
export const SIGNATORY_ROLES = [
  'Directeur du campus',
  'Responsable admissions',
] as const;

/**
 * The presets the configuration wizard applies. A preset is a point-in-time
 * copy: applying one writes modules and settings onto the event and leaves no
 * live link, which is why the seed can create these without any scenario
 * depending on them staying in step.
 */
export type EventTemplateSpec = {
  readonly name: string;
  readonly description: string;
  readonly cohortNoun: string;
  readonly startMinutes: number | null;
  readonly modules: readonly string[];
  readonly withClosingGrid: boolean;
  readonly withFeedbackForm: boolean;
  readonly withDiploma: boolean;
};

export const EVENT_TEMPLATES: readonly EventTemplateSpec[] = [
  {
    name: 'Stage de seconde',
    description:
      'Deux semaines, émargement matin et après-midi, closings et diplôme.',
    cohortNoun: 'stagiaires',
    startMinutes: 10 * 60,
    modules: ['inscrits', 'emargement', 'closings', 'bilan'],
    withClosingGrid: true,
    withFeedbackForm: true,
    withDiploma: true,
  },
  {
    name: 'Coding Club',
    description: 'Journée unique récurrente, émargement et closing court.',
    cohortNoun: 'participants',
    startMinutes: 14 * 60,
    modules: ['inscrits', 'emargement', 'closings'],
    withClosingGrid: true,
    withFeedbackForm: false,
    withDiploma: false,
  },
  {
    name: 'Portes ouvertes',
    description: 'Liste des inscrits seule.',
    cohortNoun: 'visiteurs',
    startMinutes: null,
    modules: ['inscrits'],
    withClosingGrid: false,
    withFeedbackForm: false,
    withDiploma: false,
  },
];
