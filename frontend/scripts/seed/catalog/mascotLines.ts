/**
 * EpiDuck's lines beyond the ones its migration ships (#539).
 *
 * The defaults belong to the migration, so every environment has a talking duck
 * whether or not it was ever generated, and they are not restated here. What
 * the generator adds are the two states an admin's writes produce and no
 * migration does: a seasonal line, bounded to a window around the anchor so it
 * is live on the day the dataset describes, and an archived one, which the
 * duck no longer says.
 *
 * And the lines of the seeded badges (#551), which no migration can ship since
 * they name badges the PO creates: the mockup's, one for a badge earned and
 * one for a badge still to earn, for the badges the mockup draws. The badges
 * the seed adds keep none, so the collection also shows the duck saying a
 * badge's condition.
 */

import type { PrismaClient } from '@prisma/client';
import { dateKeyToDbDate } from '../../../src/lib/domain/eventPresence';
import { toDateKey } from '../../../src/lib/domain/planningTime';
import type { Clock } from '../clock';
import { id } from '../ids';
import { BADGE_KEYS } from './badges';

/** Create-only: a line already present is left exactly as it stands. */
export async function seedMascotLines(
  prisma: PrismaClient,
  clock: Clock,
): Promise<number> {
  const day = (offset: number) =>
    dateKeyToDbDate(toDateKey(clock.days(offset), 'Europe/Paris'));
  const { count } = await prisma.mascot_Line.createMany({
    data: [
      {
        id: id('mln', 'saison'),
        momentKey: 'hello',
        text: 'Coin ! Il fait frais ce matin, {prenom}, pense à ton écharpe.',
        startsOn: day(-7),
        endsOn: day(7),
        createdAt: clock.days(-10),
        updatedAt: clock.days(-10),
      },
      {
        id: id('mln', 'archivee'),
        momentKey: 'poke',
        text: 'Une phrase que le canard ne dit plus.',
        archivedAt: clock.days(-30),
        createdAt: clock.days(-90),
        updatedAt: clock.days(-30),
      },
    ],
    skipDuplicates: true,
  });
  return count;
}

/**
 * What the duck says of a seeded badge when a talent clicks it: earned, then
 * still to earn. The mockup's lines, a year it printed made the anchor's, and
 * one citing `{date}` so the token has a line to fill.
 */
const BADGE_LINES: readonly (readonly [string, string, string])[] = [
  [
    'millesime',
    "Coin ! T'es venu·e cette année, t'as ta vignette. Vintage, comme moi.",
    'Viens une fois cette année et je te colle la vignette sur le pare-brise !',
  ],
  [
    'finisher-seconde',
    "Stage de Seconde bouclé ! T'as franchi la ligne d'arrivée, champion·ne.",
    'Termine le stage de Seconde et on agite le drapeau à damier ensemble !',
  ],
  [
    'revenant',
    "Back to Epitech ? Tu reviens d'entre les morts, j'adore !",
    'Reviens au Back to Epitech, même les zombies sont invités. Brains… euh, coin.',
  ],
  [
    'addict',
    "5 Coding Clubs ! Je crois que t'es accro. Moi aussi, mais au pain.",
    "Encore quelques Coding Clubs et t'es officiellement accro. Je juge pas.",
  ],
  [
    'premiers-pas',
    "Ta toute première activité ! Je me souviens, t'étais tout timide.",
    'Fais ta première activité, je promets de pas cancaner trop fort.',
  ],
  [
    'high-five',
    '5 activités ! Tope-là ! Enfin… tope-aile.',
    'Encore quelques activités et on se fait un high five. Plutôt un high plume.',
  ],
  [
    'dix-sur-dix',
    "10 activités. Dix sur dix. Même moi j'arrive pas à compter jusque-là.",
    "Vise les 10 activités, je t'attends au bord de la mare.",
  ],
  [
    'cyberpunk',
    'Activité Cyber validée ! Tu hackes la matrice. Chut, je dirai rien.',
    'Fais une activité Cyber et deviens un·e vrai·e cyberpunk. Néons fournis.',
  ],
  [
    'cerveau-bionique',
    'Activité IA validée ! Ton cerveau est bionique, le mien est en plumes.',
    "Tente une activité IA, promis l'IA est moins bavarde que moi.",
  ],
  [
    'mecano',
    "Activité Robotique validée ! Un robot canard, c'est pour quand ?",
    'Fais une activité Robotique et construis-moi un copain en métal !',
  ],
  [
    'hello-world',
    "Hello World ! Ton premier code, je l'ai encadré dans mon nid.",
    'Écris ton premier code et dis Hello World. Ou Hello Coin, ça marche aussi.',
  ],
  [
    'insert-coin',
    "Game Dev validé ! Insert coin… ah non, c'est moi le Coin.",
    'Fais une activité Game Dev et appuie sur Start, je suis le boss final.',
  ],
  [
    'champion',
    "Première place ! T'es le boss, j'ai même pas eu le temps de cancaner.",
    'Décroche une 1re place et je te prête ma couronne en plastique.',
  ],
  [
    'coin-coin',
    "Tu m'as parlé en {date} ! C'est le plus beau badge, je suis ému. Coin.",
    'Viens me parler, je mords pas. Enfin, presque jamais.',
  ],
  [
    'en-feu',
    "5 jours d'affilée ! T'es en feu, j'ai chaud aux plumes.",
    "Connecte-toi 5 jours d'affilée et on allume le feu !",
  ],
  [
    'inarretable',
    "10 jours de suite ! Inarrêtable. Moi je m'arrête pour une sieste.",
    "Tiens 10 jours d'affilée et plus personne ne pourra t'arrêter.",
  ],
  [
    'legende',
    "30 jours ! T'es une légende. Je vais te faire une statue en pain.",
    "30 jours d'affilée et t'entres dans la légende. Je compte sur toi !",
  ],
];

/**
 * Written after the badges, whose keys they name. Create-only like the rest,
 * and taken back with their badge, whose delete cascades onto them.
 */
export async function seedBadgeLines(
  prisma: PrismaClient,
  clock: Clock,
): Promise<number> {
  const unknown = BADGE_LINES.filter(([key]) => !BADGE_KEYS.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `Phrases de canard pour des badges que le seed n'écrit pas : ${unknown.map(([key]) => key).join(', ')}.`,
    );
  }
  const { count } = await prisma.mascot_Line.createMany({
    data: BADGE_LINES.flatMap(([badgeKey, earned, toEarn]) =>
      (
        [
          ['badgeEarned', earned],
          ['badgeToEarn', toEarn],
        ] as const
      ).map(([momentKey, text]) => ({
        id: id('mln', `${momentKey}-${badgeKey}`),
        momentKey,
        badgeKey,
        text,
        createdAt: clock.days(-10),
        updatedAt: clock.days(-10),
      })),
    ),
    skipDuplicates: true,
  });
  return count;
}
