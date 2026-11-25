/**
 * The events the campuses put forward on their talents' home, and somebody to
 * sign in as to see one.
 *
 * The note and the standing invitation are platform facts, written by
 * `platform` with the campuses (`catalog/talentHome.ts`). What this adds needs
 * the events: Paris's camp (`HIGHLIGHTED_EVENT`), Marseille's open day that has
 * since passed (`PAST_HIGHLIGHTED_EVENT`), every other campus's next Coding
 * Club but Lyon's (`NEXT_CLUB`), and the persona: a talent of Paris, onboarded,
 * whose only enrolment is a Coding Club a few days out. Nothing runs for them
 * today.
 *
 * Placed rather than found among the drawn cohorts, which would have had to
 * dodge whichever of them runs an activity today: the hero would then lead with
 * the activity, and the page would advertise a state the account does not show.
 */

import {
  HIGHLIGHTED_EVENT,
  NEXT_CLUB,
  nextClubSignupUrl,
  PAST_HIGHLIGHTED_EVENT,
  UNPOINTED_CAMPUS,
} from '../catalog/talentHome';
import { codingClubPublicName, codingClubTitre } from '../catalog/events';
import { clubCategoryOf } from '../catalog/eventCategories';
import { addDossier } from '../factories/onboarding';
import { WELCOME_XP_BONUS } from '../../../src/lib/domain/xp';
import type { Scenario } from './types';
import { SHOWN_TO_TALENTS } from './helpers';

/** Days from the anchor to the persona's Coding Club, before the highlight's. */
const SESSION_OFFSET = 3;

export const campusHome: Scenario = {
  name: 'accueil-des-campus',
  summary: 'Le mot du campus et l’événement mis en avant, par campus.',
  run(world) {
    const { clock } = world.ctx;
    const campuses = [...world.campuses.values()];
    // The row `platform` wrote with the campus's standing invitation, which
    // keeps it: pointing at an event puts the event in front of it.
    const pointAt = (campusId: string, eventId: string, updatedAt: Date) => {
      const row = world.buffer.talentHome_Highlight.find(
        (r) => r.campusId === campusId,
      );
      if (!row)
        throw new Error(
          `Le campus ${campusId} n’a pas d’invitation à mettre derrière son événement.`,
        );
      row.eventId = eventId;
      row.updatedAt = updatedAt;
    };
    const campus = campuses.find((c) => c.name === HIGHLIGHTED_EVENT.campus);
    if (!campus)
      throw new Error(
        `Le campus ${HIGHLIGHTED_EVENT.campus} manque au profil : il est le premier de tous.`,
      );

    // The camp the campus points at, after the persona's club: an event of its
    // own, still to come, with the sign-up form its hero's button opens.
    const campDays = world.eventWindow(
      HIGHLIGHTED_EVENT.dayOffset,
      HIGHLIGHTED_EVENT.days,
    );
    const camp = world.addEvent({
      ...SHOWN_TO_TALENTS,
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
    pointAt(campus.id, camp.id, clock.today);

    // A pointer the calendar has overtaken: put forward while it was to come,
    // started since, and left there. Its standing invitation leads instead.
    const stale = campuses.find(
      (c) => c.name === PAST_HIGHLIGHTED_EVENT.campus,
    );
    if (stale) {
      const days = world.eventWindow(
        PAST_HIGHLIGHTED_EVENT.dayOffset,
        PAST_HIGHLIGHTED_EVENT.days,
      );
      const openDay = world.addEvent({
        ...SHOWN_TO_TALENTS,
        key: 'evt-accueil-jpo',
        titre: `${stale.name}-${clock.dateKey(days[0]!)}-JPO`,
        publicName: PAST_HIGHLIGHTED_EVENT.publicName,
        campus: stale,
        days,
        signupUrl: PAST_HIGHLIGHTED_EVENT.signupUrl,
      });
      pointAt(
        stale.id,
        openDay.id,
        clock.days(PAST_HIGHLIGHTED_EVENT.dayOffset - 10),
      );
    }

    // Every other campus points at its next Coding Club, still to come, with
    // no words of its own: the hero writes the default invitation from its
    // name, as it does for most events in production. Nobody is enrolled yet.
    const pointing = campuses.filter(
      (c) =>
        c.id !== campus.id && c.id !== stale?.id && c.name !== UNPOINTED_CAMPUS,
    );
    const nextClubs = pointing.map((c, index) => {
      const clubDays = world.eventWindow(
        NEXT_CLUB.firstOffset + (index % NEXT_CLUB.spread),
        1,
      );
      const club = world.addEvent({
        ...SHOWN_TO_TALENTS,
        key: 'evt-accueil-prochain-club',
        titre: codingClubTitre({ campus: c.name, date: clubDays[0]! }),
        publicName: codingClubPublicName(clubDays[0]!),
        categoryKey: clubCategoryOf(clubDays[0]!),
        campus: c,
        days: clubDays,
        startMinutes: NEXT_CLUB.startMinutes,
        signupUrl: nextClubSignupUrl(c.name),
      });
      pointAt(c.id, club.id, clock.days(-7));
      return { campus: c, club };
    });

    const days = world.eventWindow(SESSION_OFFSET, 1);
    const session = world.addEvent({
      ...SHOWN_TO_TALENTS,
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
        `${PAST_HIGHLIGHTED_EVENT.campus} : une ${PAST_HIGHLIGHTED_EVENT.publicName.toLowerCase()} mise en avant qui a eu lieu depuis, que l’accueil ne montre plus : l’invitation générique passe devant`,
        `${UNPOINTED_CAMPUS} : une invitation générique seule (« toute l’année »), avec son propre libellé de bouton`,
        ...nextClubs.map(
          ({ campus: c, club }) =>
            `${c.name} : son prochain Coding Club mis en avant (${clock.dateKey(club.date)}), sans texte écrit pour lui`,
        ),
        'chaque campus : un mot du campus et l’invitation générique « Les Ateliers TECH », avec son image',
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
