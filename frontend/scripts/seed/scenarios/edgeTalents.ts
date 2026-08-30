/**
 * The states a talent can be in that production almost never contains, and that
 * the product depends on entirely.
 *
 * This scenario is where the generator deliberately stops matching PROFILE.md.
 * Production holds three dossiers stopped part-way, out of 887; here there is
 * one standing on every rung of the ladder, because those are the states the
 * wizard's resume logic is made of and no amount of realistic volume produces
 * them. The same goes for a lapsed image-rights authorisation, a talent with no
 * account, and a school validated with no school resolved.
 *
 * They are cheap to hold and impossible to reach otherwise, which is the whole
 * argument for a generated dataset over a copy of production.
 */

import { ONBOARDING_STEP_ORDER } from '../../../src/lib/domain/talentOnboarding';
import { CURRENT_DROIT_IMAGE_VERSION } from '../catalog/documentVersions';
import { MANUAL_SCHOOL_NAMES } from '../catalog/schools';
import { NOMS, PRENOMS } from '../catalog/people';
import { addDossier } from '../factories/onboarding';
import type { Scenario } from './types';

export const edgeTalents: Scenario = {
  name: 'talents-limites',
  summary:
    'Un talent par état rare : dossier bloqué à chaque étape, collégien, sans compte, divergence CRM.',
  run(world) {
    const { rng, clock } = world.ctx;
    const campus = [...world.campuses.values()][0]!;
    const schoolYear = clock.schoolYear;
    const lastYear = clock.schoolYearBefore(1);
    const event =
      world.events.find((candidate) => candidate.campusId === campus.id) ??
      world.events[0]!;

    const spawn = (
      nom: string,
      niveau: string | null,
      extra: Parameters<typeof world.addTalent>[0] extends infer T
        ? Partial<T>
        : never = {},
    ) =>
      world.addTalent({
        prenom: rng.pick(PRENOMS),
        nom,
        niveau,
        campus,
        index: world.nextTalentIndex(),
        ...extra,
      });

    // One talent standing on each rung, plus one who finished.
    for (const step of ONBOARDING_STEP_ORDER) {
      const talent = spawn(`Bloque${step}`, '2nde');
      world.enrol(event, talent);
      world.addSchoolingRecord(talent, schoolYear, null);
      addDossier(world, {
        talent,
        schoolYear,
        stopAt: step,
        imageRights: null,
      });
    }

    // A collégien: outside the onboarding ladder entirely, owed only the RGPD
    // charter. `isOnboardingEligible` is a property of the niveau, applied over
    // the ladder rather than inside it, so a dossier here would be wrong.
    const collegien = spawn('Collegien', '4eme');
    world.enrol(event, collegien);
    world.addSchoolingRecord(collegien, schoolYear, null);
    const collegienRow = world.talentRow(collegien.id) as Record<
      string,
      unknown
    >;
    collegienRow.charterAcceptedAt = clock.days(-40);
    collegienRow.firstLoginAt = clock.days(-40);

    // A refusal last year that nobody revisited. The dossier reads « En attente »
    // for the current year while the standing interdiction still forbids: read
    // the projection alone and the marker silently drops off a refused student's
    // badge on the first day of the new school year.
    const lapsed = spawn('Interdit', '1ere');
    world.enrol(event, lapsed);
    world.addSchoolingRecord(lapsed, schoolYear, null);
    addDossier(world, {
      talent: lapsed,
      schoolYear: lastYear,
      stopAt: null,
      imageRights: 'refused',
      filedOffset: -400,
    });

    // A lapsed AUTHORISATION, which must resolve to unknown rather than to
    // consent. The two cases look identical in the projection and are opposite
    // in the stance.
    const lapsedYes = spawn('Autorisationperimee', 'terminale');
    world.enrol(event, lapsedYes);
    world.addSchoolingRecord(lapsedYes, schoolYear, null);
    addDossier(world, {
      talent: lapsedYes,
      schoolYear: lastYear,
      stopAt: null,
      imageRights: 'accepted',
      filedOffset: -400,
    });

    // Two dossiers for one talent: last year's and this year's. The projection
    // must describe the most recent one, and both PDFs must survive.
    const returning = spawn('Revenant', 'terminale');
    world.enrol(event, returning);
    world.addSchoolingRecord(returning, schoolYear, null);
    addDossier(world, {
      talent: returning,
      schoolYear: lastYear,
      stopAt: null,
      imageRights: 'accepted',
      filedOffset: -400,
      projects: false,
    });
    addDossier(world, {
      talent: returning,
      schoolYear,
      stopAt: null,
      imageRights: 'refused',
      filedOffset: -50,
    });

    // A staff correction rather than a parent-portal decision.
    const corrected = spawn('Correction', '2nde');
    world.enrol(event, corrected);
    world.addSchoolingRecord(corrected, schoolYear, null);
    world.imageRightsDecision({
      talent: corrected,
      decision: 'refused',
      schoolYear,
      version: CURRENT_DROIT_IMAGE_VERSION,
      decidedAt: clock.days(-12),
      source: 'staff_correction',
      recordedByStaffId: world.staff[0]?.id ?? null,
    });

    // No login account at all: 70 talents are in this state, and every screen
    // that offers impersonation has to say so instead of offering it.
    const accountless = spawn('Sanscompte', '2nde', { withAccount: false });
    world.enrol(event, accountless);
    world.addSchoolingRecord(accountless, schoolYear, null);

    // A school validated with no school resolved, and a free-text school.
    const noUai = spawn('Lyceeinconnu', '2nde', {
      highSchoolNameManual: MANUAL_SCHOOL_NAMES[0],
    });
    world.enrol(event, noUai);
    world.addSchoolingRecord(noUai, schoolYear, null);
    addDossier(world, {
      talent: noUai,
      schoolYear,
      stopAt: 'parents',
      imageRights: null,
    });

    // What Jump believes against what Salesforce claims, after the talent
    // confirmed. This is the only way /staff/admin/sf-conflicts has a row.
    for (let i = 0; i < 4; i += 1) {
      const divergent = world.addTalent({
        prenom: PRENOMS[i % PRENOMS.length]!,
        nom: `Divergence${i}`,
        niveau: '2nde',
        campus,
        index: world.nextTalentIndex(),
        sfClaims: {
          nom: `Divergence${i}Ancien`,
          phone: '+33611111111',
        },
      });
      world.enrol(event, divergent);
      world.addSchoolingRecord(divergent, schoolYear, null);
      addDossier(world, {
        talent: divergent,
        schoolYear,
        stopAt: null,
        imageRights: 'accepted',
      });
    }

    // Enrolled on two campuses at once. The campus a talent "belongs" to is
    // derived from their most recent enrolment, so this is the row that proves
    // the derivation rather than assuming it.
    const second = [...world.campuses.values()][1];
    if (second) {
      const roamer = spawn('Deuxcampus', '1ere');
      world.enrol(event, roamer);
      const otherEvent = world.events.find(
        (candidate) => candidate.campusId === second.id,
      );
      if (otherEvent) world.enrol(otherEvent, roamer);
      world.addSchoolingRecord(roamer, schoolYear, null);
    }

    world.ctx.manifest.push({
      scenario: edgeTalents.name,
      summary: edgeTalents.summary,
      campus: campus.name,
      covers: [
        `un dossier arrêté sur chacune des ${ONBOARDING_STEP_ORDER.length} étapes (nom de famille « Bloque… »)`,
        "un collégien, hors parcours d'inscription, charte seule",
        "un refus de droit à l'image de l'an dernier, jamais revu : interdiction permanente",
        'une autorisation périmée, qui doit se lire « sans autorisation » et non « autorisé »',
        'un talent avec deux dossiers annuels et deux PDF distincts',
        "une correction de droit à l'image saisie par l'équipe",
        'un talent sans compte de connexion, un lycée sans UAI',
        'quatre divergences CRM pour /staff/admin/sf-conflicts',
        'un talent inscrit sur deux campus',
      ],
      accounts: [
        {
          role: 'talent bloqué',
          email: '(nom de famille commençant par « Bloque »)',
        },
      ],
    });
  },
};
