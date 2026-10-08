/**
 * Somebody to sign in as, to see what a campus puts on its talents' home.
 *
 * The content itself is a platform fact, written by `platform` with the campuses
 * (`catalog/talentHome.ts`), because the campus whose highlight is open has to
 * be reserved before `club` picks its own. What this adds is the persona: a
 * talent of that campus, onboarded, whose only enrolment is a Coding Club a few
 * days out. Nothing runs for them today, so their home leads with the campus's
 * highlighted event, and the session card gives the club's day and hour.
 *
 * Placed rather than found among the drawn cohorts, which would have had to
 * dodge whichever of them runs an activity today: the hero would then lead with
 * the activity, and the page would advertise a state the account does not show.
 */

import { TALENT_HOME_HIGHLIGHTS } from '../catalog/talentHome';
import { codingClubPublicName, codingClubTitre } from '../catalog/events';
import { addDossier } from '../factories/onboarding';
import { WELCOME_XP_BONUS } from '../../../src/lib/domain/xp';
import type { Scenario } from './types';

/** Days from the anchor to the persona's Coding Club, before the highlight's. */
const SESSION_OFFSET = 3;

export const campusHome: Scenario = {
  name: 'accueil-des-campus',
  summary: 'Le mot du campus et l’événement mis en avant, par campus.',
  run(world) {
    const { clock } = world.ctx;
    const openHighlight = Object.entries(TALENT_HOME_HIGHLIGHTS).find(
      ([name, highlight]) =>
        highlight.dayOffset >= 0 && world.campuses.has(name),
    );
    if (!openHighlight)
      throw new Error(
        'Aucun campus du profil ne porte d’événement mis en avant ouvert.',
      );
    const campus = world.campus(openHighlight[0]);

    const days = world.eventWindow(SESSION_OFFSET, 1);
    const session = world.addEvent({
      key: 'evt-accueil-campus',
      titre: codingClubTitre({ campus: campus.name, date: days[0]! }),
      publicName: codingClubPublicName(days[0]!),
      campus,
      days,
      // Confirmed, so the session card gives the hour as well as the day.
      startMinutes: 14 * 60,
    });

    const talent = world.addTalent({
      prenom: 'Inès',
      nom: 'Vitrine',
      niveau: '2nde',
      campus,
      index: world.nextTalentIndex(),
      career: 1,
    });
    world.enrol(session, talent, { sfMemberStatus: 'READY' });
    world.addSchoolingRecord(talent, clock.schoolYear, null);
    const filedOffset = -20;
    addDossier(world, {
      talent,
      schoolYear: clock.schoolYear,
      stopAt: null,
      imageRights: 'accepted',
      filedOffset,
    });
    world.grantXp({
      talent,
      source: 'onboarding',
      sourceId: talent.id,
      amount: WELCOME_XP_BONUS,
      at: clock.days(filedOffset),
    });

    world.ctx.manifest.push({
      scenario: campusHome.name,
      summary: campusHome.summary,
      campus: campus.name,
      covers: [
        `${campus.name} : un mot du campus (titre, liste, liens) et un événement mis en avant avec une image, en tête du bandeau bleu de tout talent du campus sans activité ce jour-là`,
        'Marseille : un mot du campus seul, sans événement mis en avant',
        'Lyon : un événement mis en avant dont le jour est passé, que l’accueil ne montre plus',
      ],
      accounts: [
        {
          role: 'talent (accueil du campus)',
          email: talent.email,
          note: `l’événement mis en avant en tête du bandeau, le mot du campus dans Actualités, et sa prochaine séance dans la carte de session`,
        },
      ],
    });
  },
};
