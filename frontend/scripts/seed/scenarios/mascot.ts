/**
 * Talents who dressed their EpiDuck (#539), and talents he has something to
 * react to on the anchor day (#540).
 *
 * Every other talent keeps the duck it was given, which is what production
 * will look like for a long while, so the accessories, a name and a duck put
 * to sleep exist only where they are placed. Four talents carry every
 * accessory between them, one renamed duck and one asleep, so the header, the
 * settings card and the questionnaire avatar each have something to draw.
 *
 * A reaction needs its moment to fall on the day the seed is opened, which a
 * drawn dataset almost never does: a run of days reaching a milestone on the
 * anchor, and a level reached that the duck has not celebrated yet (the seed
 * marks every other level as already seen, as production's migration did).
 * Opened on another day than `--today`, the run is no longer on its milestone.
 *
 * It runs after the levels, so the draws it takes move nothing before it.
 */

import { WELCOME_XP_BONUS } from '../../../src/lib/domain/xp';
import { dateKeyToDbDate } from '../../../src/lib/domain/eventPresence';
import { addDossier } from '../factories/onboarding';
import { grantReward } from '../factories/engagement';
import type {
  MascotGlasses,
  MascotHair,
  MascotScarf,
} from '../../../src/lib/domain/mascot';
import type { Scenario } from './types';

type Dressed = {
  nom: string;
  name: string | null;
  glasses: MascotGlasses;
  scarf: MascotScarf;
  hair: MascotHair;
  asleep: boolean;
};

const DRESSED: readonly Dressed[] = [
  {
    nom: 'Canard Gaston',
    name: 'Gaston',
    glasses: 'round',
    scarf: 'red',
    hair: 'crest',
    asleep: false,
  },
  {
    nom: 'Canard Soleil',
    name: null,
    glasses: 'sun',
    scarf: 'green',
    hair: 'fringe',
    asleep: false,
  },
  {
    nom: 'Canard Endormi',
    name: 'Plume',
    glasses: 'geek',
    scarf: 'orange',
    hair: 'beanie',
    asleep: true,
  },
  {
    nom: 'Canard Rose',
    name: null,
    glasses: 'none',
    scarf: 'pink',
    hair: 'tuft',
    asleep: false,
  },
];

export const mascot: Scenario = {
  name: 'canard',
  summary:
    'Quatre talents qui ont habillé leur EpiDuck (chaque accessoire, un canard renommé, un canard endormi), et deux à qui il a quelque chose à fêter.',
  run(world) {
    const { clock } = world.ctx;
    const campus = [...world.campuses.values()][0]!;
    const accounts: { role: string; email: string; note: string }[] = [];

    /** A talent past the dossier, the app open to them. */
    function dossierTalent(nom: string) {
      const talent = world.addTalent({
        nom,
        niveau: '2nde',
        campus,
        index: world.nextTalentIndex(),
      });
      addDossier(world, {
        talent,
        schoolYear: clock.schoolYear,
        stopAt: null,
        parentCoSigned: true,
        imageRights: 'accepted',
        filedOffset: -30,
      });
      return talent;
    }

    for (const dressed of DRESSED) {
      const talent = dossierTalent(dressed.nom);
      Object.assign(world.talentRow(talent.id), {
        mascotName: dressed.name,
        mascotGlasses: dressed.glasses,
        mascotScarf: dressed.scarf,
        mascotHair: dressed.hair,
        mascotAsleepAt: dressed.asleep ? clock.days(-2) : null,
      });
      accounts.push({
        role: 'talent (canard habillé)',
        email: talent.email,
        note: [
          dressed.name ? `canard « ${dressed.name} »` : 'canard « EpiDuck »',
          `lunettes ${dressed.glasses}, écharpe ${dressed.scarf}, coiffure ${dressed.hair}`,
          dressed.asleep ? 'endormi' : null,
        ]
          .filter(Boolean)
          .join(', '),
      });
    }

    // The day before the anchor closed a run of six days, so the anchor's
    // first visit makes it seven, a milestone.
    const regular = dossierTalent('Canard Fidèle');
    Object.assign(world.talentRow(regular.id), {
      streakDays: 6,
      streakLastDay: dateKeyToDbDate(clock.dateKey(clock.days(-1))),
      streakPreviousDay: dateKeyToDbDate(clock.dateKey(clock.days(-2))),
    });
    accounts.push({
      role: 'talent (série de jours)',
      email: regular.email,
      note: '7 jours d’affilée à sa première visite du jour : le canard le remarque',
    });

    // Past Maker's threshold with the level last celebrated at nothing: the
    // home plays the level scene once.
    const climber = dossierTalent('Canard Grimpeur');
    world.grantXp({
      talent: climber,
      source: 'onboarding',
      sourceId: climber.id,
      amount: WELCOME_XP_BONUS,
      at: clock.days(-30),
    });
    grantReward(world, climber, 'ctf_shell_2026', 2600 - WELCOME_XP_BONUS);
    world.talentRow(climber.id).levelCelebratedXp = WELCOME_XP_BONUS;
    accounts.push({
      role: 'talent (niveau à fêter)',
      email: climber.email,
      note: '2 600 XP, niveau Maker pas encore fêté : la scène du canard à l’accueil',
    });

    world.ctx.manifest.push({
      scenario: mascot.name,
      summary: mascot.summary,
      campus: campus.name,
      covers: [
        'le canard habillé dans l’en-tête et dans les paramètres',
        'un canard renommé qui anime les questionnaires',
        'un canard endormi sur toutes les pages',
        'un palier de série remarqué à l’arrivée',
        'un niveau fêté sur la scène du canard',
      ],
      accounts,
    });
  },
};
