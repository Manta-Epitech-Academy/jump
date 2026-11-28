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

import { daysBetween, type DateKey } from './planningTime';
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

/**
 * The run lengths of consecutive days the duck notices, the day the talent
 * reaches one (#540). A milestone, never every day: a duck that counted each
 * visit would celebrate opening the app, which is the habit loop this audience
 * is spared. Nothing marks a broken run either.
 */
export const STREAK_MILESTONES: readonly number[] = [
  3, 7, 14, 30, 60, 100, 200, 365,
];

/** What each token a line may cite resolves to, in French, for the author. */
export const MASCOT_TOKENS = {
  prenom: 'Prénom du talent.',
  canard: 'Nom que le talent a donné à son canard (« EpiDuck » par défaut).',
  jours: 'Nombre de jours depuis sa dernière visite.',
  xp: "Nombre d'XP que le talent vient de gagner.",
  bonus:
    "Part de ces XP qui récompense d'être parmi les premiers de son campus à s'inscrire.",
  niveau: 'Nom du niveau que le talent vient d’atteindre (Maker, Hacker…).',
  serie: "Nombre de jours d'affilée où le talent est venu dans Jump.",
  evenement: "Nom de l'événement.",
  badge: 'Nom du badge sur lequel le talent a cliqué.',
  date: 'Mois et année où le talent a obtenu le badge (« janvier 2026 »).',
} as const;

export type MascotToken = keyof typeof MASCOT_TOKENS;

/**
 * How he looks while he says it: at ease, or with his eyes squeezed in joy and
 * a hop, for what the talent did or is about to do.
 */
export type MascotMood = 'calm' | 'joy';

interface MascotMoment {
  /** French, read by the admin API. */
  label: string;
  /** When the duck says it, in French, read by the admin API. */
  description: string;
  /** The tokens a line of this moment may cite; any other is refused. */
  tokens: readonly MascotToken[];
  mood: MascotMood;
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
    mood: 'calm',
  },
  hello: {
    label: 'Bonjour',
    description:
      "Chaque visite d'un talent déjà venu, deux secondes après son arrivée : le canard s'arrête pour le saluer, une fois par visite et non à chaque page. Une phrase par jour, toujours la même ce jour-là.",
    tokens: ['prenom', 'canard'],
    mood: 'calm',
  },
  away: {
    label: 'Retour après une absence',
    description: `Première visite d'un talent après ${MASCOT_AWAY_DAYS} jours ou plus sans venir, à la place du bonjour. Jamais un reproche.`,
    tokens: ['prenom', 'canard', 'jours'],
    mood: 'joy',
  },
  sleep: {
    label: 'Endormi',
    description: 'Le talent endort son canard, qui plonge.',
    tokens: ['prenom', 'canard'],
    mood: 'calm',
  },
  wake: {
    label: 'Réveillé',
    description: 'Le talent réveille son canard, qui remonte.',
    tokens: ['prenom', 'canard'],
    mood: 'calm',
  },
  streak: {
    label: 'Série de jours',
    description: `Arrivée d'un talent le jour où sa série de jours d'affilée atteint un palier (${STREAK_MILESTONES.join(', ')}), à la place du bonjour. Jamais rien quand une série s'arrête.`,
    tokens: ['prenom', 'canard', 'serie'],
    mood: 'joy',
  },
  eventTomorrow: {
    label: 'Événement demain',
    description:
      "Arrivée d'un talent inscrit à un événement qui commence demain, juste après le bonjour.",
    tokens: ['prenom', 'canard', 'evenement'],
    mood: 'calm',
  },
  eventToday: {
    label: 'Événement aujourd’hui',
    description:
      "Arrivée d'un talent inscrit à un événement qui a lieu aujourd'hui, juste après le bonjour.",
    tokens: ['prenom', 'canard', 'evenement'],
    mood: 'joy',
  },
  firstMeeting: {
    label: 'Première rencontre',
    description:
      "Première arrivée du talent dans Jump, sur l'écran d'accueil : le canard se présente. Le talent ne lui a pas encore donné de nom.",
    tokens: ['prenom', 'canard'],
    mood: 'joy',
  },
  arrivalXp: {
    label: "XP d'arrivée",
    description:
      "Les XP gagnés en terminant son inscription, fêtés au centre de l'écran à la première arrivée sur l'accueil.",
    tokens: ['prenom', 'canard', 'xp'],
    mood: 'joy',
  },
  earlyArrivalXp: {
    label: "XP d'arrivée parmi les premiers",
    description:
      "Comme les XP d'arrivée, pour un talent parmi les premiers de son campus à terminer son inscription, qui reçoit un bonus.",
    tokens: ['prenom', 'canard', 'xp', 'bonus'],
    mood: 'joy',
  },
  activityXp: {
    label: "XP d'activité",
    description:
      "Les XP des étapes validées sur une activité, fêtés au centre de l'écran quand le talent revient sur l'accueil. Ils peuvent couvrir une soirée entière d'étapes.",
    tokens: ['prenom', 'canard', 'xp'],
    mood: 'joy',
  },
  dailyGameXp: {
    label: 'XP du défi du jour',
    description:
      "Les XP du défi du jour réussi, fêtés au centre de l'écran juste après la partie.",
    tokens: ['prenom', 'canard', 'xp'],
    mood: 'joy',
  },
  rankXp: {
    label: 'XP de classement',
    description:
      "Le bonus d'XP d'un défi du jour terminé parmi les meilleurs de son campus, fêté au centre de l'écran à la visite suivante.",
    tokens: ['prenom', 'canard', 'xp'],
    mood: 'joy',
  },
  levelUp: {
    label: 'Niveau passé',
    description:
      "Le talent atteint un nouveau niveau : la grande scène, une seule fois par niveau, après les XP qui l'y ont mené.",
    tokens: ['prenom', 'canard', 'niveau'],
    mood: 'joy',
  },
  checkIn: {
    label: 'Émargement',
    description:
      "Le talent vient d'émarger avec le QR code de l'événement : le canard le lui confirme sur l'écran de l'émargement.",
    tokens: ['prenom', 'canard', 'evenement'],
    mood: 'joy',
  },
  feedbackDone: {
    label: 'Questionnaire rempli',
    description:
      "Le talent vient d'envoyer un questionnaire sur un événement : le canard le remercie. Jamais si l'envoi a échoué.",
    tokens: ['prenom', 'canard', 'evenement'],
    mood: 'joy',
  },
  badgeEarned: {
    label: 'Badge obtenu',
    description:
      "Le talent clique sur un badge qu'il a obtenu, dans sa collection : le canard lui dit ce qu'il a fait pour l'avoir. Chaque phrase est celle d'un badge ; sans phrase, le canard dit la condition du badge.",
    tokens: ['prenom', 'canard', 'badge', 'date'],
    mood: 'joy',
  },
  badgeToEarn: {
    label: 'Badge à obtenir',
    description:
      "Le talent clique sur un badge qu'il n'a pas encore, dans sa collection : le canard lui dit ce qui le débloque, comme une invitation, jamais un reproche. Chaque phrase est celle d'un badge ; sans phrase, le canard dit la condition du badge.",
    tokens: ['prenom', 'canard', 'badge'],
    mood: 'calm',
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
 * The moments whose lines each belong to one badge (#551): what he says when
 * a talent clicks that badge in their collection. Every line of these names
 * its badge, and no line of another moment names one. With no line, he says
 * the badge's condition, which is the PO's sentence too: not a fallback in
 * code, the badge explained by what it asks.
 */
export const MASCOT_BADGE_MOMENTS = ['badgeEarned', 'badgeToEarn'] as const;

export type MascotBadgeMoment = (typeof MASCOT_BADGE_MOMENTS)[number];

export function isMascotBadgeMoment(
  key: MascotMomentKey,
): key is MascotBadgeMoment {
  return (MASCOT_BADGE_MOMENTS as readonly string[]).includes(key);
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

/**
 * What the talent chose for their duck, as stored: an empty name keeps his own
 * (`MASCOT_DEFAULT_NAME`), so clearing the field is how a rename is undone.
 * What the settings edit and save; `shownMascotLook` is how it is drawn.
 */
export type MascotChoice = MascotLook;

/** The talent's choice, read off the `Talent` columns that hold it. */
export function mascotChoiceOf(talent: {
  mascotName: string | null;
  mascotGlasses: MascotGlasses;
  mascotScarf: MascotScarf;
  mascotHair: MascotHair;
}): MascotChoice {
  return {
    name: talent.mascotName ?? '',
    glasses: talent.mascotGlasses,
    scarf: talent.mascotScarf,
    hair: talent.mascotHair,
  };
}

/** The duck a choice draws: his own name when the talent left it empty. */
export function shownMascotLook(choice: MascotChoice): MascotLook {
  return { ...choice, name: choice.name.trim() || MASCOT_DEFAULT_NAME };
}

/** Whether two choices dress him the same, name included. */
export function sameMascotChoice(a: MascotChoice, b: MascotChoice): boolean {
  return (
    a.name === b.name &&
    a.glasses === b.glasses &&
    a.scarf === b.scarf &&
    a.hair === b.hair
  );
}

/**
 * Whether the talent's duck hosts a questionnaire: it names no persona of its
 * own (#539). He then speaks its texts, its closing thanks included.
 */
export function duckHosts(form: { personaName?: string }): boolean {
  return !form.personaName?.trim();
}

// ---- When the duck greets -----------------------------------------------------

export type MascotGreeting = {
  moment: 'hello' | 'away';
  daysAway: number;
} | null;

/** The talent's visit days as `Talent` holds them (`streakLastDay`, `streakPreviousDay`). */
export type VisitDays = {
  lastDay: DateKey | null;
  previousDay: DateKey | null;
};

/**
 * What the duck says on arrival, from the day of the talent's last visit
 * before today.
 *
 * That day is `lastDay` until the streak write counts today, and
 * `previousDay` from then on: the write keeps the day it moves past, so which
 * request of the day loaded the row does not matter (a request a guard
 * redirected counts the day before any page renders). Null means no visit
 * before today: the first meeting, which the welcome screen's introduction
 * answers (`firstMeeting`), not the header's greeting. A talent
 * back the same day gets a hello: the duck greets each visit, and the
 * controller keeps it to one per visit.
 */
export function greetingFor(visits: VisitDays, today: DateKey): MascotGreeting {
  const before =
    visits.lastDay && visits.lastDay < today
      ? visits.lastDay
      : visits.previousDay;
  if (!before) return null;
  const daysAway = daysBetween(before, today);
  return {
    moment: daysAway >= MASCOT_AWAY_DAYS ? 'away' : 'hello',
    daysAway,
  };
}

// ---- What the duck says on arrival -------------------------------------------

/** One line the duck is to say, and what its tokens resolve to there. */
export type MascotCue = {
  moment: MascotMomentKey;
  tokens?: MascotTokenValues;
};

/**
 * The run of consecutive days that counts today, `streakDays` as it will be
 * once today's visit is written. The talent row a page reads may have been
 * loaded before that write (`recordSignInDay` runs beside the request, not
 * before it), so a last visit yesterday means today extends the run, and an
 * older one means today starts a new one.
 */
export function streakToday(
  visits: VisitDays,
  streakDays: number,
  today: DateKey,
): number {
  if (!visits.lastDay) return 1;
  const gap = daysBetween(visits.lastDay, today);
  if (gap <= 0) return Math.max(streakDays, 1);
  return gap === 1 ? streakDays + 1 : 1;
}

/** An event the talent is enrolled in, its days read on its campus clock. */
export type EnrolledEventDays = {
  name: string;
  /** First and last day, and today, all on the event's campus clock. */
  date: DateKey;
  endDate: DateKey;
  today: DateKey;
};

/**
 * What the duck may say when the talent arrives, best first (#540). He says
 * one: the first of these with a live line (`MascotController.arrive`), so a
 * moment the PO left silent hands over to the next rather than leaving him
 * mute on arrival.
 *
 * 1. the welcome back, after weeks away;
 * 2. an event under way today, the day the talent most needs to hear about;
 * 3. the day's milestone of the run of days. It cannot fall on a welcome
 *    back, since weeks away the run starts again at 1;
 * 4. an event starting tomorrow;
 * 5. hello.
 *
 * One line, not one per piece of news: each holds the bubble five seconds,
 * and two in a row on arrival read as a duck reciting a list. The event
 * lines name the talent, so they greet as well. On a day with an event and a
 * milestone, the milestone goes unsaid: the next one is a few days off.
 *
 * Nothing on a first visit, which the welcome screen's introduction answers.
 */
export function arrivalCues({
  visits,
  streakDays,
  today,
  events,
}: {
  visits: VisitDays;
  streakDays: number;
  today: DateKey;
  events: readonly EnrolledEventDays[];
}): MascotCue[] {
  const greeting = greetingFor(visits, today);
  if (!greeting) return [];
  const cues: MascotCue[] = [];
  if (greeting.moment === 'away') {
    cues.push({ moment: 'away', tokens: { jours: String(greeting.daysAway) } });
  }
  const { ongoing, tomorrow } = eventNews(events);
  if (ongoing) {
    cues.push({ moment: 'eventToday', tokens: { evenement: ongoing.name } });
  }
  const run = streakToday(visits, streakDays, today);
  if (STREAK_MILESTONES.includes(run)) {
    cues.push({ moment: 'streak', tokens: { serie: String(run) } });
  }
  if (tomorrow) {
    cues.push({
      moment: 'eventTomorrow',
      tokens: { evenement: tomorrow.name },
    });
  }
  cues.push({ moment: 'hello' });
  return cues;
}

/** The event under way today and the one starting tomorrow, if any. */
function eventNews(events: readonly EnrolledEventDays[]): {
  ongoing?: EnrolledEventDays;
  tomorrow?: EnrolledEventDays;
} {
  const byDate = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  );
  return {
    ongoing: byDate.find((e) => e.date <= e.today && e.today <= e.endDate),
    tomorrow: byDate.find((e) => daysBetween(e.today, e.date) === 1),
  };
}

// ---- What the duck may say today ---------------------------------------------

/** The duck's live lines, grouped by moment. A moment with none is absent. */
export type MascotVoice = Partial<Record<MascotMomentKey, string[]>>;
