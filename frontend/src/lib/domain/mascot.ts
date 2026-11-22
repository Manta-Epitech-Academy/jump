/**
 * EpiDuck, the talent space's mascot (#539): who he is, when he speaks, and
 * what a line he says may contain. Its doctrine is `.claude/rules/mascot.md`.
 *
 * The split that rules the whole module: **the code decides when the duck
 * speaks, an admin decides what he says.** The moments below are a closed
 * catalogue, because each one is fired by code somewhere; the lines are
 * `Mascot_Line` rows written over `write_mascot_line`, so the duck can talk
 * about Christmas or a camp without a deploy. A moment with no active line is
 * silent, and silence is a valid state, never an error.
 */

import { parseDate } from '@internationalized/date';
import type { DateKey } from './planningTime';
import { fillTokens, unknownTokens } from './textTokens';

/** The name a duck answers to until its talent picks one, and the public's. */
export const MASCOT_DEFAULT_NAME = 'EpiDuck';

/** Longest name a talent may give their duck: it has to fit a chat header. */
export const MASCOT_NAME_MAX = 24;

/**
 * Longest line the duck says. The bubble is about 230px wide, so past this a
 * line stops being a quip and becomes a paragraph over the page.
 */
export const MASCOT_LINE_MAX = 140;

/**
 * From this many days without a visit, the duck welcomes the talent back
 * (`away`) instead of greeting them (`hello`). Two weeks: past a weekly club's
 * rhythm, short of a whole holiday.
 */
export const MASCOT_AWAY_DAYS = 14;

/** What each token a line may cite resolves to, in French, for the author. */
export const MASCOT_TOKENS = {
  prenom: 'Prénom du talent.',
  canard: 'Nom que le talent a donné à son canard (« EpiDuck » par défaut).',
  jours: 'Nombre de jours depuis sa dernière visite.',
} as const;

export type MascotToken = keyof typeof MASCOT_TOKENS;

interface MascotMoment {
  /** French, read by the admin API. */
  label: string;
  /** When the duck says it, in French, read by the admin API. */
  description: string;
  /** The tokens a line of this moment may cite; any other is refused. */
  tokens: readonly MascotToken[];
}

/**
 * Every moment the duck speaks at. Adding one is code (something has to fire
 * it) plus lines over the API; retiring one deletes its lines in a migration.
 */
export const MASCOT_MOMENTS = {
  poke: {
    label: 'Clic sur le canard',
    description:
      'Le talent clique sur son canard. Les phrases tournent à chaque clic.',
    tokens: ['prenom', 'canard'],
  },
  hello: {
    label: 'Bonjour',
    description:
      "Chaque visite d'un talent déjà venu, deux secondes après son arrivée : le canard s'arrête pour le saluer, une fois par visite et non à chaque page. Une phrase par jour, toujours la même ce jour-là.",
    tokens: ['prenom', 'canard'],
  },
  away: {
    label: 'Retour après une absence',
    description: `Première visite d'un talent après ${MASCOT_AWAY_DAYS} jours ou plus sans venir, à la place du bonjour. Jamais un reproche.`,
    tokens: ['prenom', 'canard', 'jours'],
  },
  sleep: {
    label: 'Endormi',
    description: 'Le talent endort son canard, qui plonge.',
    tokens: ['prenom', 'canard'],
  },
  wake: {
    label: 'Réveillé',
    description: 'Le talent réveille son canard, qui remonte.',
    tokens: ['prenom', 'canard'],
  },
} as const satisfies Record<string, MascotMoment>;

export type MascotMomentKey = keyof typeof MASCOT_MOMENTS;

export const MASCOT_MOMENT_KEYS = Object.keys(
  MASCOT_MOMENTS,
) as MascotMomentKey[];

export function isMascotMoment(key: string): key is MascotMomentKey {
  return Object.hasOwn(MASCOT_MOMENTS, key);
}

/**
 * The tokens a line names that its moment does not offer, each once, in order.
 * Empty means the line is safe to store.
 */
export function unknownMascotTokens(
  moment: MascotMomentKey,
  text: string,
): string[] {
  return unknownTokens(text, new Set<string>(MASCOT_MOMENTS[moment].tokens));
}

export type MascotTokenValues = Partial<Record<MascotToken, string>>;

/**
 * A line as the talent reads it. Every token a stored line cites was checked
 * against its moment at write, so one missing a value here is one this screen
 * cannot know: it renders empty rather than as `{jours}` in a bubble.
 */
export function fillLine(text: string, values: MascotTokenValues): string {
  return fillTokens(text, (name) =>
    Object.hasOwn(MASCOT_TOKENS, name)
      ? (values[name as MascotToken] ?? '')
      : undefined,
  );
}

// ---- The duck's look ---------------------------------------------------------

/**
 * The accessories, keyed by the values of the Prisma enums `Mascot_Glasses`,
 * `Mascot_Scarf` and `Mascot_Hair` (a contract test holds the two together).
 * The body is never among them: EpiDuck stays Epitech blue.
 */
export const MASCOT_GLASSES = {
  none: 'Aucune',
  round: 'Rondes',
  sun: 'Soleil',
  geek: 'Geek',
} as const;
export const MASCOT_SCARVES = {
  none: 'Aucune',
  red: 'Rouge',
  green: 'Verte',
  orange: 'Orange',
  pink: 'Rose',
} as const;
export const MASCOT_HAIRS = {
  tuft: 'Houppe',
  crest: 'Crête',
  fringe: 'Mèche',
  beanie: 'Bonnet',
} as const;

export type MascotGlasses = keyof typeof MASCOT_GLASSES;
export type MascotScarf = keyof typeof MASCOT_SCARVES;
export type MascotHair = keyof typeof MASCOT_HAIRS;

/** Everything that tells one talent's duck from another's. */
export interface MascotLook {
  name: string;
  glasses: MascotGlasses;
  scarf: MascotScarf;
  hair: MascotHair;
}

/** The duck nobody dressed: a public respondent's, the staff preview's. */
export const DEFAULT_MASCOT_LOOK: MascotLook = {
  name: MASCOT_DEFAULT_NAME,
  glasses: 'none',
  scarf: 'none',
  hair: 'tuft',
};

/** A talent's duck, read off the `Talent` columns that hold it. */
export function mascotLookOf(talent: {
  mascotName: string | null;
  mascotGlasses: MascotGlasses;
  mascotScarf: MascotScarf;
  mascotHair: MascotHair;
}): MascotLook {
  return {
    name: talent.mascotName?.trim() || MASCOT_DEFAULT_NAME,
    glasses: talent.mascotGlasses,
    scarf: talent.mascotScarf,
    hair: talent.mascotHair,
  };
}

// ---- When the duck greets -----------------------------------------------------

export type MascotGreeting = {
  moment: 'hello' | 'away';
  daysAway: number;
} | null;

/**
 * What the duck says on arrival, from the day of the talent's previous visit.
 *
 * `previousDay` is `Talent.streakLastDay` as the request loaded it: on the
 * first request of a day it still holds the previous visit, since the streak
 * write does not touch the loaded row. Null means no visit ever recorded, which
 * is the first meeting and not a greeting (#540). A talent back the same day
 * gets a hello: the duck greets each visit, and the controller keeps it to
 * one per visit.
 */
export function greetingFor(
  previousDay: DateKey | null,
  today: DateKey,
): MascotGreeting {
  if (!previousDay) return null;
  // A CalendarDate compares as a count of days.
  const daysAway = parseDate(today).compare(parseDate(previousDay));
  return {
    moment: daysAway >= MASCOT_AWAY_DAYS ? 'away' : 'hello',
    daysAway,
  };
}

// ---- What the duck may say today ---------------------------------------------

/** The duck's live lines, grouped by moment. A moment with none is absent. */
export type MascotVoice = Partial<Record<MascotMomentKey, string[]>>;
