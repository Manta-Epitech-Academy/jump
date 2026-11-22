/**
 * One talent in each state of the home's hero, placed (#501).
 *
 * The hero is derived, from a talent's enrolments, the subjects their events
 * offer at this moment and what their campus puts forward, and stored nowhere,
 * so no schema check can see a state of it missing. `assert/derivedStates.ts`
 * computes it for every seeded talent with the domain's own rule
 * (`pickHomeHero`) and fails on a state nobody lands in; this is what places
 * one talent in each.
 *
 * Each state has to hold whatever the hour the environment is opened at, and
 * whatever weekday the anchor falls on:
 *
 *   - the three « en ce moment » events run from the day before the anchor to
 *     the day after, calendar days rather than weekdays, so the anchor is
 *     inside them on a Sunday too, and offer their subjects for the whole event
 *     (a half-day subject would only be there half the day; the flagship stage
 *     carries those). The one without a subject has no arrival time, so it is
 *     under way from midnight;
 *   - the two enrolled talents are expected days ahead, never today;
 *   - the invited talent, the generic one and the two Marseille ones came to
 *     an event weeks ago, which is what makes the campus theirs
 *     (`resolveTalentCampus`) and leaves them with nothing to come.
 *
 * The campuses are the three every profile has (`catalog/talentHome.ts`):
 * Paris points at its camp, Lyon only invites « toute l'année », Marseille's
 * pointer has been overtaken and leaves its hero to what a talent started.
 *
 * And one talent whose only event is a stage under way that no admin activated
 * (#516): a schedule and a subject her screens never show, the example
 * `assert/reachability.ts` asks for.
 *
 * Runs last, like `niveaux`, so the draws it takes move no talent, event or
 * name of the scenarios before it; every talent's career is placed, so no
 * later draw enrols them anywhere else.
 */

import { addDossier } from '../factories/onboarding';
import { EVENT_CATEGORY } from '../catalog/eventCategories';
import { CODING_CLUB_PLANNING, STAGE_PLANNING } from '../catalog/planning';
import { WORKSHOPS } from '../catalog/workshops';
import { HIGHLIGHTED_EVENT } from '../catalog/talentHome';
import { WELCOME_XP_BONUS } from '../../../src/lib/domain/xp';
import type { HomeHeroState } from '../../../src/lib/domain/talentHome';
import type { CampusRef, EventRef, TalentRef, World } from '../world';
import type { Scenario } from './types';
import { SHOWN_TO_TALENTS } from './helpers';

function workshop(slug: string) {
  const spec = WORKSHOPS.find((w) => w.slug === slug);
  if (!spec || !spec.enabled) {
    throw new Error(`homeHero: le sujet « ${slug} » n’est pas au catalogue.`);
  }
  return spec;
}

/** An onboarded talent of `campus`, whose career is the events given here. */
function persona(
  world: World,
  opts: {
    prenom: string;
    nom: string;
    campus: CampusRef;
    events: readonly EventRef[];
  },
): TalentRef {
  const { clock } = world.ctx;
  const talent = world.addTalent({
    person: { prenom: opts.prenom, civilite: 'femme' },
    nom: opts.nom,
    niveau: '2nde',
    campus: opts.campus,
    index: world.nextTalentIndex(),
    career: opts.events.length,
  });
  for (const event of opts.events) {
    world.enrol(event, talent, { sfMemberStatus: 'READY' });
  }
  world.addSchoolingRecord(talent, clock.schoolYear, null);
  const filedOffset = -40;
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
  return talent;
}

export const homeHero: Scenario = {
  name: 'bandeau-accueil',
  summary:
    'Un talent dans chaque état du bandeau de l’accueil : pendant un événement (plusieurs sujets, un seul, aucun), inscrit à un événement à venir, invité, invitation générique, sujet à continuer, rien ; et une talent inscrite à un stage que personne n’a activé.',
  run(world) {
    const { clock } = world.ctx;
    const paris = world.campus(HIGHLIGHTED_EVENT.campus);
    const lyon = world.campus('Lyon');
    const marseille = world.campus('Marseille');
    // From yesterday to tomorrow, weekend or not: under way at any hour.
    const running = [clock.days(-1), clock.days(0), clock.days(1)];
    const placed: { state: HomeHeroState; talent: TalentRef; note: string }[] =
      [];

    // ── Pendant : trois sujets au choix, l'un commencé ─────────────────────
    const choice = world.addEvent({
      ...SHOWN_TO_TALENTS,
      key: 'bandeau-stage-choix',
      titre: `${paris.name}-${clock.dateKey(running[0]!)}-StageSeconde`,
      publicName: 'Stage de seconde',
      cohortNoun: 'stagiaire',
      categoryKey: EVENT_CATEGORY.STAGE,
      campus: paris,
      days: running,
      startMinutes: 9 * 60,
      workshops: [
        { slug: 'pacman-ia' },
        { slug: 'babel-ship' },
        { slug: 'rayban' },
      ],
      hero: {
        live: {
          title: 'Trois sujets, à toi de choisir',
          text: 'Choisis celui qui te tente : tu pourras passer à un autre une fois le premier terminé.',
        },
      },
    });
    world.addPlanning(choice, STAGE_PLANNING);
    const chooser = persona(world, {
      prenom: 'Lina',
      nom: 'Choix',
      campus: paris,
      events: [choice],
    });
    const pacman = workshop('pacman-ia');
    world.enterWorkshop({
      talent: chooser,
      event: choice,
      slug: pacman.slug,
      solvedSteps: 4,
      at: clock.at(-1, 9, 30),
      celebrated: true,
    });
    placed.push({
      state: 'live-choice',
      talent: chooser,
      note: 'trois sujets au choix, Pacman IA commencé',
    });

    // ── Pendant : un seul sujet ────────────────────────────────────────────
    const single = world.addEvent({
      ...SHOWN_TO_TALENTS,
      key: 'bandeau-club-sujet',
      titre: `${paris.name}-${clock.dateKey(running[0]!)}-CampSujet`,
      publicName: 'Camp de la Toussaint',
      cohortNoun: 'participant',
      categoryKey: EVENT_CATEGORY.CAMP,
      campus: paris,
      days: running,
      startMinutes: 10 * 60,
      workshops: [{ slug: 'babel-ship' }],
    });
    placed.push({
      state: 'live-one',
      talent: persona(world, {
        prenom: 'Sacha',
        nom: 'Sujet',
        campus: paris,
        events: [single],
      }),
      note: 'un seul sujet, jamais ouvert : la maquette telle quelle',
    });

    // ── Pendant : aucun sujet à ce moment ──────────────────────────────────
    const quiet = world.addEvent({
      ...SHOWN_TO_TALENTS,
      key: 'bandeau-stage-sans-sujet',
      titre: `${paris.name}-${clock.dateKey(running[0]!)}-StageSansSujet`,
      publicName: 'Stage de troisième',
      cohortNoun: 'stagiaire',
      categoryKey: EVENT_CATEGORY.STAGE,
      campus: paris,
      days: running,
      startMinutes: null,
    });
    world.addPlanning(quiet, STAGE_PLANNING);
    placed.push({
      state: 'live-none',
      talent: persona(world, {
        prenom: 'Noé',
        nom: 'Planning',
        campus: paris,
        events: [quiet],
      }),
      note: 'en ce moment, sans sujet : « Voir le planning »',
    });

    // ── Inscrit, avec une heure d'accueil ──────────────────────────────────
    const expected = world.addEvent({
      ...SHOWN_TO_TALENTS,
      key: 'bandeau-club-attendu',
      titre: `${paris.name}-${clock.dateKey(clock.days(5))}-CodingClub`,
      publicName: 'Coding Club Pac-Man',
      cohortNoun: 'participant',
      categoryKey: EVENT_CATEGORY.CODING_CLUB,
      campus: paris,
      days: [clock.days(5)],
      startMinutes: 10 * 60,
      hero: {
        enrolled: {
          text: 'Apporte ta bonne humeur, on s’occupe des ordinateurs et du goûter.',
          picture: { width: 1280, height: 720 },
        },
      },
    });
    world.addPlanning(expected, CODING_CLUB_PLANNING);
    placed.push({
      state: 'enrolled-arrival',
      talent: persona(world, {
        prenom: 'Maëlle',
        nom: 'Attendue',
        campus: paris,
        events: [expected],
      }),
      note: 'J-5, accueil à 10h00, texte et image écrits pour un inscrit',
    });

    // ── Inscrit, le jour seul ──────────────────────────────────────────────
    const dayOnly = world.addEvent({
      ...SHOWN_TO_TALENTS,
      key: 'bandeau-camp-jour',
      titre: `${lyon.name}-${clock.dateKey(clock.days(12))}-Camp`,
      publicName: 'Camp robotique',
      cohortNoun: 'participant',
      categoryKey: EVENT_CATEGORY.CAMP,
      campus: lyon,
      days: [clock.days(12), clock.days(13)],
      startMinutes: null,
    });
    placed.push({
      state: 'enrolled-day',
      talent: persona(world, {
        prenom: 'Yanis',
        nom: 'Bientot',
        campus: lyon,
        events: [dayOnly],
      }),
      note: 'J-12, sans heure d’accueil : le jour seul, les mots de la maquette',
    });

    // ── Venus il y a quelques semaines : leur campus parle pour eux ────────
    // A visit weeks ago: what makes the campus a talent's
    // (`resolveTalentCampus`, any event), and, for the talent with a subject to
    // carry on, what offers it, which only an activated event does.
    const past = (campus: CampusRef, key: string, offset: number) => {
      const offersSubject = key.endsWith('continuer');
      return world.addEvent({
        ...(offersSubject ? SHOWN_TO_TALENTS : {}),
        key,
        titre: `${campus.name}-${clock.dateKey(clock.days(offset))}-CodingClub`,
        publicName: 'Coding Club',
        cohortNoun: 'participant',
        categoryKey: EVENT_CATEGORY.CODING_CLUB,
        campus,
        days: [clock.days(offset)],
        startMinutes: 14 * 60,
        workshops: offersSubject ? [{ slug: 'santa-shooter' }] : undefined,
      });
    };

    placed.push({
      state: 'invitation',
      talent: persona(world, {
        prenom: 'Inaya',
        nom: 'Invitee',
        campus: paris,
        events: [past(paris, 'bandeau-passe-invitee', -30)],
      }),
      note: `pas inscrite au ${HIGHLIGHTED_EVENT.publicName} que son campus met en avant`,
    });

    placed.push({
      state: 'generic',
      talent: persona(world, {
        prenom: 'Gabin',
        nom: 'Generique',
        campus: lyon,
        events: [past(lyon, 'bandeau-passe-generique', -30)],
      }),
      note: 'l’invitation « toute l’année » de Lyon, avec son libellé de bouton',
    });

    const homework = past(marseille, 'bandeau-passe-continuer', -10);
    const carrier = persona(world, {
      prenom: 'Côme',
      nom: 'Continue',
      campus: marseille,
      events: [homework],
    });
    const santa = workshop('santa-shooter');
    world.enterWorkshop({
      talent: carrier,
      event: homework,
      slug: santa.slug,
      solvedSteps: 2,
      at: clock.at(-10, 15, 0),
      celebrated: true,
    });
    placed.push({
      state: 'continue',
      talent: carrier,
      note: 'Santa Shooter commencé au dernier Coding Club, rien à venir',
    });

    placed.push({
      state: 'none',
      talent: persona(world, {
        prenom: 'Rose',
        nom: 'Rien',
        campus: marseille,
        events: [past(marseille, 'bandeau-passe-rien', -30)],
      }),
      note: 'rien à mettre en avant : l’accueil sans bandeau',
    });

    // ── Inscrite à un stage que personne n'a activé (#516) ─────────────────
    // A Salesforce campaign under way, as the sync leaves it: raw title, no
    // public name, no section, never activated, but with a schedule and a
    // subject, which is everything the home, the planning and the activities
    // would show her of an activated one. They show none of it: her hero is
    // her campus's invitation, as if she were enrolled nowhere. Last, so its
    // draws move nobody placed above.
    const unprepared = world.addEvent({
      key: 'bandeau-stage-non-active',
      titre: `${paris.name}-${clock.dateKey(running[0]!)}-StageNonPrepare`,
      campus: paris,
      days: running,
      startMinutes: 9 * 60,
      workshops: [{ slug: 'babel-ship' }],
    });
    world.addPlanning(unprepared, STAGE_PLANNING);
    placed.push({
      state: 'invitation',
      talent: persona(world, {
        prenom: 'Elsa',
        nom: 'Masquee',
        campus: paris,
        events: [unprepared],
      }),
      note: 'inscrite à un stage en cours que personne n’a activé : ni bandeau, ni planning, ni activité ne le montrent',
    });

    world.ctx.manifest.push({
      scenario: homeHero.name,
      summary: homeHero.summary,
      covers: [
        'pendant un événement : trois sujets au choix sans qu’aucun ne passe devant, un sujet seul comme sur la maquette, aucun sujet à ce moment avec « Voir le planning »',
        'inscrit : le compte à rebours, l’heure d’accueil quand l’événement en a une, « Ajouter à mon agenda »',
        `invité au ${HIGHLIGHTED_EVENT.publicName} de ${HIGHLIGHTED_EVENT.campus}, l’invitation générique de Lyon, un sujet à continuer chez soi, et un accueil sans bandeau`,
        'inscrite à un stage en cours que personne n’a activé : l’accueil, le planning et les activités le taisent, et l’espace dev ne l’ouvre pas',
      ],
      accounts: placed.map(({ state, talent, note }) => ({
        role: `talent (bandeau ${state})`,
        email: talent.email,
        note,
      })),
    });
  },
};
