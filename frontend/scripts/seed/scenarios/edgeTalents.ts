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
import {
  DROIT_IMAGE_VERSIONS,
  versionForYear,
} from '../catalog/documentVersions';
import { MANUAL_SCHOOL_NAMES } from '../catalog/schools';
import { NOMS, PRENOMS } from '../catalog/people';
import { addDossier } from '../factories/onboarding';
import { addMinigameAttempt } from '../factories/engagement';
import { NIVEAUX } from '../../../src/lib/domain/niveau';
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
      extra: Partial<Parameters<typeof world.addTalent>[0]> = {},
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

    // A guardian who still owes both acts, which is where the parent flow
    // actually starts. Every other dossier in the dataset is settled or nearly
    // so, and `/parent/welcome` lands on « merci » the moment nothing is
    // pending - so without this the flow is reachable and empty. Two declared
    // guardians on the same family besides, because `parent2Email` is a real
    // column that the auth-conflict check reads and that nothing else fills.
    const owing = spawn('Responsableenattente', '2nde');
    world.enrol(event, owing);
    world.addSchoolingRecord(owing, schoolYear, null);
    addDossier(world, {
      talent: owing,
      schoolYear,
      stopAt: null,
      parentCoSigned: false,
      imageRights: null,
    });
    const owingGuardian = world.setGuardian(owing, { withSecond: true });

    // A staff correction rather than a parent-portal decision.
    const corrected = spawn('Correction', '2nde');
    world.enrol(event, corrected);
    world.addSchoolingRecord(corrected, schoolYear, null);
    world.imageRightsDecision({
      talent: corrected,
      decision: 'refused',
      schoolYear,
      version: versionForYear(DROIT_IMAGE_VERSIONS, schoolYear),
      decidedAt: clock.days(-12),
      source: 'staff_correction',
      recordedByStaffId: world.staff[0]?.id ?? null,
      note: 'Refus transmis par téléphone par le responsable légal, saisi par l’équipe.',
    });

    // One talent on every niveau the domain declares.
    //
    // Production's distribution is dominated by 2nde (55.7%) and thins out to a
    // tenth of a percent, so realistic volume alone leaves ten of the sixteen
    // with no row at all - and `isOnboardingEligible` branches on collège
    // against lycée, while the broadcast filters and the cohort profile all read
    // this column. Same reason a talent stands on every rung of the onboarding
    // ladder: these are states the code is made of, not states volume produces.
    for (const niveau of NIVEAUX) {
      const talent = spawn(`Niveau${niveau}`, niveau);
      world.enrol(event, talent);
      world.addSchoolingRecord(talent, schoolYear, null);
    }

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

    // A talent who never came from Salesforce, and a talent Jump holds no phone
    // number for. Both columns are nullable and neither had a null row, so the
    // « fiche créée dans Jump » badge and every « pas de téléphone » fallback
    // were unreachable - and the second is what the SMS relance skips on.
    const native = spawn('Sanscrm', '1ere', { externalId: null, phone: null });
    world.enrol(event, native);
    world.addSchoolingRecord(native, schoolYear, null);

    // A talent with no campus at all: imported before any enrolment resolved
    // one. The campus columns on `XpGrant` and `MinigameAttempt` are unbound
    // snapshots of what was true at the time, so « on ne savait pas encore » is
    // a state they are nullable for and that nothing else produces.
    const unplaced = world.addTalent({
      prenom: rng.pick(PRENOMS),
      nom: 'Sanscampus',
      niveau: '2nde',
      campus: null,
      index: world.nextTalentIndex(),
    });
    world.addSchoolingRecord(unplaced, schoolYear, null);
    world.grantXp({
      talent: unplaced,
      source: 'onboarding',
      sourceId: unplaced.id,
      amount: 20,
    });
    const anyPublication = world.buffer.minigamePublication[0]?.id as
      string | undefined;
    if (anyPublication) {
      addMinigameAttempt(world, {
        talent: unplaced,
        publicationId: anyPublication,
        status: 'done',
        scored: true,
        xpSeen: true,
        index: 500,
      });
    }

    // A talent who has objected to usage analytics. `usage/record.ts` honours
    // the objection by writing nothing at all for them, so a dataset without one
    // exercises the opt-out branch never - and it is the operable art. 21 right
    // the whole legitimate-interest basis rests on.
    const objector = spawn('Opposition', 'terminale');
    world.enrol(event, objector);
    world.addSchoolingRecord(objector, schoolYear, null);
    (
      world.talentRow(objector.id) as Record<string, unknown>
    ).usageAnalyticsOptOutAt = clock.days(-18);

    // The pre-annual document keys, which the schema still carries as LEGACY and
    // which `talentAccount.ts` still collects when it erases somebody. They
    // belong to a talent whose PDFs were rendered before the documents became
    // annual, so nothing writes them any more and nothing but this can prove the
    // erasure sweep still picks them up.
    const preAnnual = spawn('Documentslegacy', 'terminale');
    world.enrol(event, preAnnual);
    world.addSchoolingRecord(preAnnual, schoolYear, null);
    addDossier(world, {
      talent: preAnnual,
      schoolYear,
      stopAt: null,
      imageRights: 'accepted',
      filedOffset: -70,
    });
    const legacyRow = world.talentRow(preAnnual.id) as Record<string, unknown>;
    legacyRow.rulesFilePath = `documents/${preAnnual.id}/rules.pdf`;
    legacyRow.imageRightsFilePath = `documents/${preAnnual.id}/image-rights.pdf`;

    // The two PDF renders that did not succeed. Placed rather than drawn, at
    // one talent each: a failure rate applied to a cohort produces nothing at
    // all on the smallest profile, and the queue screen these are for would then
    // be tested on some profiles and not others.
    for (const outcome of ['failed', 'pending'] as const) {
      const talent = spawn(`Rendu${outcome}`, '2nde');
      world.enrol(event, talent);
      world.addSchoolingRecord(talent, schoolYear, null);
      addDossier(world, {
        talent,
        schoolYear,
        stopAt: null,
        imageRights: 'accepted',
        filedOffset: -35,
        renderOutcome: outcome,
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
        'un responsable légal qui doit encore la co-signature et la décision, avec un second responsable déclaré',
        'un talent sans compte de connexion, un lycée sans UAI',
        'quatre divergences CRM pour /staff/admin/sf-conflicts',
        'un talent inscrit sur deux campus',
        'un talent sans fiche Salesforce et sans téléphone, un autre sans campus',
        'un talent opposé à la mesure d’usage (aucune ligne d’usage écrite pour lui)',
        'un rendu PDF en échec et un autre encore en file, pour la file de génération',
        'un talent portant les anciennes clés de document, d’avant le passage à l’annuel',
      ],
      accounts: [
        {
          role: 'talent bloqué',
          email: '(nom de famille commençant par « Bloque »)',
        },
        {
          role: 'responsable légal',
          email: owingGuardian.email,
          note: 'espace parent, règlement et droit à l’image encore à régler',
        },
      ],
    });
  },
};
