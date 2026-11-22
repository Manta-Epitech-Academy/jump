/**
 * Talents who dressed their EpiDuck (#539).
 *
 * Every other talent keeps the duck it was given, which is what production
 * will look like for a long while, so the accessories, a name and a duck put
 * to sleep exist only where they are placed. Four talents carry every
 * accessory between them, one renamed duck and one asleep, so the header, the
 * settings card and the questionnaire avatar each have something to draw.
 *
 * It runs after the levels, so the draws it takes move nothing before it.
 */

import { addDossier } from '../factories/onboarding';
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
    'Quatre talents qui ont habillé leur EpiDuck : chaque accessoire, un canard renommé, un canard endormi.',
  run(world) {
    const { clock } = world.ctx;
    const campus = [...world.campuses.values()][0]!;
    const accounts: { role: string; email: string; note: string }[] = [];

    for (const dressed of DRESSED) {
      const talent = world.addTalent({
        nom: dressed.nom,
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

    world.ctx.manifest.push({
      scenario: mascot.name,
      summary: mascot.summary,
      campus: campus.name,
      covers: [
        'le canard habillé dans l’en-tête et dans les paramètres',
        'un canard renommé qui anime les questionnaires',
        'un canard endormi sur toutes les pages',
      ],
      accounts,
    });
  },
};
