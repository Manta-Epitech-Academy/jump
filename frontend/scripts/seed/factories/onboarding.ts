/**
 * Dossiers.
 *
 * Platform onboarding is walked once per school year: `Onboarding_Record` is the
 * fact, and the flat columns on `Talent` are its cached projection. This factory
 * writes both, and copies the projection through
 * `ONBOARDING_PROJECTED_FIELDS` rather than by hand, so a field added to the
 * projection is carried here without anybody remembering to.
 *
 * Two rules from the domain are enforced here rather than left to a scenario.
 *
 * The projection describes the MOST RECENT dossier, not the current year. A
 * talent with a 2025-2026 dossier and nothing since projects last year's state
 * and stamps `onboardingSchoolYear` accordingly. Aligning it with the clock is
 * the tempting mistake, and it is what would make a guardian's late signature
 * invisible.
 *
 * And the ladder is a pure function of which timestamps are set. `stopAt` names
 * the step the talent is standing on, everything before it is stamped and
 * everything from it on is null, so `getOnboardingStep` returns exactly that
 * step. Production has three such talents in total, all at the first two rungs;
 * the generator puts one on every rung on purpose, because those are the states
 * the wizard's resume logic is made of and the ones nobody can otherwise reach.
 */

import type { ImageRightsDecision, Prisma } from '@prisma/client';
import {
  ONBOARDING_PROJECTED_FIELDS,
  ONBOARDING_STEP_ORDER,
  type OnboardingStep,
} from '../../../src/lib/domain/talentOnboarding';
import {
  DROIT_IMAGE_VERSIONS,
  REGLEMENT_VERSIONS,
  versionForYear,
} from '../catalog/documentVersions';
import type { World, TalentRef } from '../world';
import { CIVILITE_OPTIONS } from '../../../src/lib/domain/profile';
import { id } from '../ids';

/** Where the talent stopped. `null` means they went all the way through. */
export type DossierProgress = OnboardingStep | null;

/**
 * How far past its filing date a dossier's own acts fall: the guardian signs a
 * week after the talent, and decides image rights the day after that.
 *
 * Exported because a caller spreading dossiers over a window has to leave that
 * much room before the anchor, and the caller is the only one who knows the
 * window. `addDossier` refuses rather than trusting each of them to remember:
 * `stage` computed the offset from the enrolment index, so a cohort of more
 * than seventy filed dossiers dated after `--today` - 115 of them at the `dev`
 * profile and the same at `staging`, with signatures and rendered PDFs to
 * match. Nothing caught it because `test:seed` runs the `ci` profile, whose
 * cohort never reaches the index where it starts.
 */
const PARENT_SIGNATURE_DELAY = 8;
const IMAGE_RIGHTS_DELAY = 9;
export const DOSSIER_SPAN_DAYS = IMAGE_RIGHTS_DELAY;

const STEP_TIMESTAMPS: Record<OnboardingStep, readonly string[]> = {
  identity: ['infoValidatedAt'],
  school: ['highSchoolValidatedAt'],
  parents: ['parentsValidatedAt'],
  interests: [
    'techInterestsValidatedAt',
    'generalInterestsValidatedAt',
    'interestsRecapSeenAt',
  ],
  equipment: ['equipmentValidatedAt'],
  processing: ['processingCompletedAt'],
  rules: ['rulesSignedAt'],
};

export function addDossier(
  world: World,
  opts: {
    talent: TalentRef;
    schoolYear: string;
    stopAt: DossierProgress;
    /** Whether a guardian co-signed the règlement. 804 of 866 did. */
    parentCoSigned?: boolean;
    imageRights?: ImageRightsDecision | null;
    /** False when a later dossier exists, so this one must not project. */
    projects?: boolean;
    /** Day offset the dossier was filed on. Negative, and see DOSSIER_SPAN_DAYS. */
    filedOffset?: number;
    /**
     * How the image-rights PDF render ended. `success` unless a caller places
     * one of the other two, which exactly one scenario does.
     */
    renderOutcome?: 'success' | 'error' | 'pending';
  },
): void {
  const clock = world.ctx.clock;
  const filedOffset = opts.filedOffset ?? -60;
  if (filedOffset + DOSSIER_SPAN_DAYS > 0) {
    throw new Error(
      `addDossier(${opts.talent.id}): filed at D${filedOffset}, which puts its last act ${filedOffset + DOSSIER_SPAN_DAYS} days after the anchor. Nothing this generator writes may be dated after --today.`,
    );
  }
  const filed = clock.days(filedOffset);
  const imageRightsVersion = versionForYear(
    DROIT_IMAGE_VERSIONS,
    opts.schoolYear,
  );
  const dossier: Prisma.Onboarding_RecordCreateManyInput = {
    id: id('onb', opts.talent.id.replace(/^sd_/, ''), opts.schoolYear),
    talentId: opts.talent.id,
    schoolYear: opts.schoolYear,
    createdAt: filed,
  };

  const stopIndex =
    opts.stopAt === null
      ? ONBOARDING_STEP_ORDER.length
      : ONBOARDING_STEP_ORDER.indexOf(opts.stopAt);
  const reached = ONBOARDING_STEP_ORDER.slice(0, stopIndex);
  for (const [offset, step] of reached.entries()) {
    for (const column of STEP_TIMESTAMPS[step]) {
      (dossier as Record<string, unknown>)[column] = clock.days(
        filedOffset + offset,
      );
    }
  }

  // Written exactly where the application writes it: `Talent.parentEmail` is
  // only ever set by the wizard's parents step. Putting it here rather than in
  // the scenarios is what makes it impossible to have a dossier that passed the
  // rung and a parent workspace that cannot resolve anybody.
  if (reached.includes('parents')) {
    world.setGuardian(opts.talent, {
      createdAt: clock.days(
        filedOffset + ONBOARDING_STEP_ORDER.indexOf('parents'),
      ),
    });
  }
  // The same rule, one rung further along, and it was the one missing: a dossier
  // stamped past the interests step with no interest attached is a state the
  // wizard cannot produce and every reader of that relation reads as empty.
  if (reached.includes('interests')) world.pickInterests(opts.talent);

  // The two remaining optional answers, each written by the step that asks it.
  // Optional means BOTH branches have to exist: filling them on every talent
  // renders the block on every fiche and never its absence, which is the same
  // defect as never filling them, only harder to notice.
  const talentRow = world.talentRow(opts.talent.id) as Record<string, unknown>;
  if (reached.includes('identity') && world.wizardRng.chance(0.7)) {
    talentRow.civilite = world.wizardRng.pick(CIVILITE_OPTIONS).value;
  }
  if (reached.includes('equipment') && world.wizardRng.chance(0.4)) {
    talentRow.setupDescription =
      'Un portable de 2019, 8 Go de RAM, et un écran externe à la maison.';
  }

  const signedRules = opts.stopAt === null;
  if (signedRules) {
    dossier.rulesSignedCity = 'Paris';
    dossier.reglementVersion = versionForYear(
      REGLEMENT_VERSIONS,
      opts.schoolYear,
    );
    dossier.rulesFilePath = `documents/${opts.talent.id}/rules-${opts.schoolYear}.pdf`;
    if (opts.parentCoSigned ?? true) {
      dossier.parentRulesSignedAt = clock.days(
        filedOffset + PARENT_SIGNATURE_DELAY,
      );
      dossier.parentRulesSignerPrenom = 'Responsable';
      dossier.parentRulesSignerNom = opts.talent.nom;
      dossier.parentRulesRelationship = 'Parent';
      dossier.parentRulesSignedCity = 'Paris';
    }
  }

  // How the image-rights render went. Resolved before the file path is written,
  // because the two are one fact: the dossier points at a document only once a
  // document exists. A failed job carries the error and no file, a queued one
  // has not been processed at all, and a dataset of nothing but successes
  // produces neither - which is the whole reason the PDF queue screen exists.
  //
  // PLACED by the caller, never drawn. Production's failure rate is a few per
  // cent, and a few per cent of the `ci` profile's 26 dossiers rounds to none:
  // coverage would then depend on the profile rather than on the generator,
  // which is the same trap `stage.ts` avoids by placing every verdict.
  const renderOutcome = opts.renderOutcome ?? 'success';
  const renderedImageRightsPath =
    renderOutcome === 'success'
      ? `documents/${opts.talent.id}/image-rights-${opts.schoolYear}.pdf`
      : null;

  if (opts.imageRights) {
    const decidedAt = clock.days(filedOffset + IMAGE_RIGHTS_DELAY);
    dossier.imageRightsDecision = opts.imageRights;
    dossier.imageRightsDecidedAt = decidedAt;
    dossier.imageRightsSignerPrenom = 'Responsable';
    dossier.imageRightsSignerNom = opts.talent.nom;
    dossier.imageRightsRelationship = 'Parent';
    dossier.imageRightsSignedCity = 'Paris';
    dossier.imageRightsVersion = imageRightsVersion;
    dossier.imageRightsFilePath = renderedImageRightsPath;
    world.imageRightsDecision({
      talent: opts.talent,
      decision: opts.imageRights,
      schoolYear: opts.schoolYear,
      version: imageRightsVersion,
      decidedAt,
    });
  }

  world.buffer.onboarding_Record.push(dossier);

  // The PDF the dossier owns, keyed per school year. One key per talent is what
  // let a second year's render overwrite a document a guardian had signed.
  if (signedRules) {
    world.buffer.onboardingPdfJob.push({
      id: id(
        'opj',
        opts.talent.id.replace(/^sd_/, ''),
        opts.schoolYear,
        'rules',
      ),
      talentId: opts.talent.id,
      documentType: 'rules',
      schoolYear: opts.schoolYear,
      status: 'success',
      filePath: dossier.rulesFilePath as string,
      processedAt: filed,
    });
  }
  if (opts.imageRights) {
    world.buffer.onboardingPdfJob.push({
      id: id(
        'opj',
        opts.talent.id.replace(/^sd_/, ''),
        opts.schoolYear,
        'image-rights',
      ),
      talentId: opts.talent.id,
      documentType: 'image-rights',
      schoolYear: opts.schoolYear,
      status: renderOutcome,
      filePath: renderedImageRightsPath,
      errorMessage:
        renderOutcome === 'error'
          ? 'Rendu interrompu : le navigateur n’a pas répondu dans le délai imparti.'
          : null,
      // A queued job has not run, so there is no moment it finished at.
      processedAt: renderOutcome === 'pending' ? null : filed,
    });
  }

  if (opts.projects ?? true) {
    const row = world.talentRow(opts.talent.id) as Record<string, unknown>;
    for (const field of ONBOARDING_PROJECTED_FIELDS) {
      row[field] = (dossier as Record<string, unknown>)[field] ?? null;
    }
    row.onboardingSchoolYear = opts.schoolYear;
    // Account-scoped, not dossier-scoped: the RGPD charter is accepted once per
    // account and never re-asked, and the welcome splash is seen once.
    const charterAcceptedAt = clock.days(filedOffset - 1);
    row.charterAcceptedAt = charterAcceptedAt;
    // Its own artifact, and account-scoped rather than annual: the charter is a
    // once-per-account consent, so the job carries the year it was rendered in
    // and never gets a second one. Without this the whole `charter` branch of
    // the PDF worker had no example - and it is the only document a collégien
    // ever signs, since they have no dossier at all.
    world.buffer.onboardingPdfJob.push({
      id: id('opj', opts.talent.id.replace(/^sd_/, ''), 'charter'),
      talentId: opts.talent.id,
      documentType: 'charter',
      schoolYear: opts.schoolYear,
      status: 'success',
      filePath: `documents/${opts.talent.id}/charter.pdf`,
      processedAt: charterAcceptedAt,
    });
    row.welcomeSeenAt = clock.days(filedOffset - 1);
    row.firstLoginAt = clock.days(filedOffset - 1);
    row.lastActiveAt = clock.days(-5);
  }
}
