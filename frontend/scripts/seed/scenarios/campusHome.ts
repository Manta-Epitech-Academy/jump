/**
 * Somebody to sign in as, to see what a campus puts on its talents' home, and
 * the event that campus puts forward.
 *
 * The note and the generic invitation are platform facts, written by `platform`
 * with the campuses (`catalog/talentHome.ts`), and `club` keeps its regulars off
 * any campus that puts something forward. What this adds is the event the
 * campus points at (`HIGHLIGHTED_EVENT`), which needs the events, and the
 * persona: a talent of that campus, onboarded, whose only enrolment is a Coding
 * Club a few days out. Nothing runs for them today.
 *
 * Placed rather than found among the drawn cohorts, which would have had to
 * dodge whichever of them runs an activity today: the hero would then lead with
 * the activity, and the page would advertise a state the account does not show.
 */

import {
  HIGHLIGHTED_EVENT,
  OPEN_HIGHLIGHT_CAMPUSES,
  PAST_HIGHLIGHTED_EVENT,
} from '../catalog/talentHome';
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
    const campuses = [...world.campuses.values()];
    const campus =
      campuses.find((c) => c.name === HIGHLIGHTED_EVENT.campus) ??
      campuses.find((c) => OPEN_HIGHLIGHT_CAMPUSES.has(c.name));
    if (!campus)
      throw new Error(
        'Aucun campus du profil ne met d’événement ni d’invitation en avant.',
      );

    // The camp the campus points at, after the persona's club: an event of its
    // own, still to come, with the sign-up form its hero's button opens.
    const campDays = world.eventWindow(
      HIGHLIGHTED_EVENT.dayOffset,
      HIGHLIGHTED_EVENT.days,
    );
    const camp = world.addEvent({
      key: 'evt-accueil-camp',
      titre: `${campus.name}-${clock.dateKey(campDays[0]!)}-HalloweenCamp`,
      publicName: HIGHLIGHTED_EVENT.publicName,
      campus,
      days: campDays,
      startMinutes: 10 * 60,
      signupUrl: HIGHLIGHTED_EVENT.signupUrl,
      hero: {
        invitation: {
          text: 'Pendant les vacances, programme l’IA des fantômes de Pac-Man, goûte nos crêpes et rencontre un ancien déguisé en mort-vivant. Gratuit et ouvert aux débutants : inscris-toi !',
          picture: { width: 1280, height: 720 },
        },
      },
    });
    const row = world.buffer.talentHome_Highlight.find(
      (r) => r.campusId === campus.id,
    );
    if (row) row.eventId = camp.id;
    else
      world.buffer.talentHome_Highlight.push({
        campusId: campus.id,
        eventId: camp.id,
        updatedAt: clock.today,
      });

    // A pointer the calendar has overtaken: put forward while it was to come,
    // started since, and left there. Its campus puts nothing else forward.
    const stale = campuses.find(
      (c) => c.name === PAST_HIGHLIGHTED_EVENT.campus,
    );
    if (stale && !OPEN_HIGHLIGHT_CAMPUSES.has(stale.name)) {
      const days = world.eventWindow(
        PAST_HIGHLIGHTED_EVENT.dayOffset,
        PAST_HIGHLIGHTED_EVENT.days,
      );
      const openDay = world.addEvent({
        key: 'evt-accueil-jpo',
        titre: `${stale.name}-${clock.dateKey(days[0]!)}-JPO`,
        publicName: PAST_HIGHLIGHTED_EVENT.publicName,
        campus: stale,
        days,
        signupUrl: PAST_HIGHLIGHTED_EVENT.signupUrl,
      });
      world.buffer.talentHome_Highlight.push({
        campusId: stale.id,
        eventId: openDay.id,
        updatedAt: clock.days(PAST_HIGHLIGHTED_EVENT.dayOffset - 10),
      });
    }

    const days = world.eventWindow(SESSION_OFFSET, 1);
    const session = world.addEvent({
      key: 'evt-accueil-campus',
      titre: codingClubTitre({ campus: campus.name, date: days[0]! }),
      publicName: codingClubPublicName(days[0]!),
      campus,
      days,
      // Confirmed, so the hero gives the arrival hour as well as the day.
      startMinutes: 14 * 60,
    });

    const talent = world.addTalent({
      person: { prenom: 'Inès', civilite: 'femme' },
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
        `${campus.name} : un mot du campus (titre, liste, liens), une invitation générique avec une image, et le ${HIGHLIGHTED_EVENT.publicName} mis en avant, avec son texte et son image d’invitation`,
        `${PAST_HIGHLIGHTED_EVENT.campus} : un mot du campus et une ${PAST_HIGHLIGHTED_EVENT.publicName.toLowerCase()} mise en avant qui a eu lieu depuis, que l’accueil ne montre plus`,
        'Lyon : une invitation générique seule (« toute l’année »), avec son propre libellé de bouton',
      ],
      accounts: [
        {
          role: 'talent (accueil du campus)',
          email: talent.email,
          note: `le mot du campus dans Actualité, et sa prochaine séance dans le bandeau (« Tu es inscrit »)`,
        },
      ],
    });
  },
};
