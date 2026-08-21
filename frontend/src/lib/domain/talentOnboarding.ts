/**
 * Canonical platform-onboarding ladder — the single source of truth for both
 * the wizard's resume logic (`(talent)/onboarding/+page.server.ts`) and the
 * staff-facing progress label (`(staff)/staff/admin/talents`).
 *
 * Each step writes its own timestamp; the wizard resumes at the first one still
 * null, so the step a talent is "on" is purely a function of which timestamps
 * are set — there is no hidden cursor state. The dashboard guard (`guards.ts`)
 * gates on the whole ladder being complete plus the charter being accepted.
 *
 * "Platform onboarding" (login → fill profile → sign règlement online) overlaps
 * too much with the règlement-compliance signals to be a useful *cohort*
 * metric: the guardian's `parentRulesSignedAt` (the canonical online co-signature)
 * already covers that artifact. The signal stays interesting on a *single*
 * talent (did this person make it past the welcome email, and where would
 * impersonation drop me?), which is what this module is scoped to.
 */

export type OnboardingStep =
  | 'identity'
  | 'school'
  | 'parents'
  | 'interests'
  | 'equipment'
  | 'processing'
  | 'rules';

/**
 * The ladder, in order. Exported because the onboarding-funnel aggregate walks
 * it rung by rung (`server/services/adminStats/onboardingFunnel.ts`): a second
 * hardcoded list there would silently stop counting a step added here.
 */
export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
  'identity',
  'school',
  'parents',
  'interests',
  'equipment',
  'processing',
  'rules',
] as const;

/** Short French labels for staff-facing UI (admin impersonation, etc.). */
export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  identity: 'Identité',
  school: 'Lycée',
  parents: "Contacts d'urgence",
  interests: "Centres d'intérêt",
  equipment: 'Matériel',
  processing: 'Génération',
  rules: 'Règlement',
};

/**
 * The timestamps each step posts. `interests` is the one step backed by two
 * timestamps — tech and general interests are validated together — so it is
 * only "done" once both are set.
 */
export type OnboardingStepFields = {
  infoValidatedAt: Date | string | null;
  highSchoolValidatedAt: Date | string | null;
  parentsValidatedAt: Date | string | null;
  techInterestsValidatedAt: Date | string | null;
  generalInterestsValidatedAt: Date | string | null;
  equipmentValidatedAt: Date | string | null;
  processingCompletedAt: Date | string | null;
  rulesSignedAt: Date | string | null;
};

/**
 * The step the talent would resume at, or `null` when onboarding is complete.
 * Returns the first step whose timestamp is still null, so it tolerates a
 * non-monotonic profile (resumes at the earliest gap).
 */
export function getOnboardingStep(
  t: OnboardingStepFields,
): OnboardingStep | null {
  if (!t.infoValidatedAt) return 'identity';
  if (!t.highSchoolValidatedAt) return 'school';
  if (!t.parentsValidatedAt) return 'parents';
  if (!t.techInterestsValidatedAt || !t.generalInterestsValidatedAt)
    return 'interests';
  if (!t.equipmentValidatedAt) return 'equipment';
  if (!t.processingCompletedAt) return 'processing';
  if (!t.rulesSignedAt) return 'rules';
  return null;
}

export type TalentOnboardingStatus = 'not-ready' | 'done';

export type TalentOnboardingFields = OnboardingStepFields & {
  charterAcceptedAt: Date | string | null;
};

/**
 * Whether a talent has cleared the whole funnel. "Done" means every step
 * timestamp is set *and* the charter is accepted — the charter is signed
 * alongside the rules step but kept explicit to mirror `guards.ts`.
 */
export function deriveOnboardingStatus(
  t: TalentOnboardingFields,
): TalentOnboardingStatus {
  return getOnboardingStep(t) === null && t.charterAcceptedAt != null
    ? 'done'
    : 'not-ready';
}

/**
 * Every column an `Onboarding_Record` projects onto `Talent`. Declared once so
 * the dossier and its projection cannot drift: `onboardingYearService` builds
 * the refresh by walking this list, and a field added to the record but not to
 * `Talent` (or the reverse) fails to type-check there rather than silently
 * stopping being projected.
 *
 * The gates come first, in ladder order, then what freezes the year's règlement
 * signatures. What is NOT projected, and why, is documented on the Prisma model.
 */
export const ONBOARDING_PROJECTED_FIELDS = [
  'infoValidatedAt',
  'highSchoolValidatedAt',
  'parentsValidatedAt',
  'techInterestsValidatedAt',
  'generalInterestsValidatedAt',
  'interestsRecapSeenAt',
  'equipmentValidatedAt',
  'processingCompletedAt',
  'rulesSignedAt',
  'rulesSignedCity',
  'reglementVersion',
  'parentRulesSignedAt',
  'parentRulesSignerPrenom',
  'parentRulesSignerNom',
  'parentRulesRelationship',
  'parentRulesSignedCity',
] as const;

export type OnboardingProjectedField =
  (typeof ONBOARDING_PROJECTED_FIELDS)[number];

/**
 * A talent's onboarding projection together with the year it describes.
 *
 * The flat columns are NOT "this year's onboarding" - they are the most recent
 * dossier, whichever year that was, and `onboardingSchoolYear` says which. That
 * distinction is the whole point of the stamp, and it splits every reader in two:
 *
 *   - **"Did they ever / when did they"** reads the flat columns and ignores the
 *     stamp. Regenerating a signed PDF, the signature-date time series, the
 *     broadcast filters, the image-rights display, the early-bird count, serving
 *     a document from `/settings/documents`: all of those mean the last
 *     signature, and the last signature is exactly what the columns hold.
 *   - **"Is the dossier for year Y done"** goes through
 *     {@link onboardingFieldsForYear} (in memory) or narrows on
 *     `onboardingSchoolYear` (in SQL). The wizard, the guards, the staff dossier
 *     statuses and the cohort aggregates all ask this one.
 *
 * Y is not always the current year: an aggregate scoped to a past school year
 * asks about that year's dossier, which is what makes the historical funnel stop
 * answering with today's state.
 */
export type DatedOnboardingFields = TalentOnboardingFields & {
  onboardingSchoolYear: string | null;
};

/**
 * The onboarding state that applies to `schoolYear`: the talent's own columns
 * when the projection is that year's, every projected field nulled otherwise -
 * which is what a year with no dossier looks like.
 *
 * Only keys actually present on the input are nulled. A caller that selected a
 * narrow slice gets that slice back honestly, rather than the function inventing
 * a `parentRulesSignedAt: null` it never asked for, which downstream would read
 * as "not co-signed" instead of "not queried".
 *
 * `charterAcceptedAt` and `welcomeSeenAt` survive either way - they are
 * once-per-account, not part of the yearly dossier - so a returning talent
 * re-walks the ladder without re-accepting the charte or seeing the splash again.
 *
 * Keeping this separate from {@link getOnboardingStep} is deliberate: the ladder
 * stays a pure function of the timestamps handed to it, which is what lets the
 * onboarding funnel mirror it rung for rung in SQL. The year is a question about
 * *which* timestamps to hand it, answered before the ladder runs.
 */
export function onboardingFieldsForYear<T extends DatedOnboardingFields>(
  t: T,
  schoolYear: string,
): T {
  if (t.onboardingSchoolYear === schoolYear) return t;
  const cleared: Partial<Record<OnboardingProjectedField, null>> = {};
  for (const f of ONBOARDING_PROJECTED_FIELDS) {
    if (f in t) cleared[f] = null;
  }
  return { ...t, ...cleared };
}

/**
 * Every Talent column that records "this onboarding-state event happened at T",
 * in the order a talent crosses them. Owns the canonical reset semantics: any
 * code that brings a talent back to a pre-onboarding state (admin reset, RGPD
 * anonymisation) must clear all of these together via `clearOnboardingTimestamps()`,
 * so adding a new gate timestamp to the schema lights up both paths.
 *
 * Includes more than the 8 step gates in `OnboardingStepFields`:
 *   - `welcomeSeenAt` is the pre-step splash ack (guarded in `guards.ts`).
 *   - `interestsRecapSeenAt` is the post-interests view ack (not a gate, but
 *     behavioural metadata the anonymised row must not carry).
 *   - `charterAcceptedAt` is separate from the steps but part of
 *     `TalentOnboardingFields` and the dashboard guard.
 */
const ONBOARDING_TIMESTAMP_FIELDS = [
  'welcomeSeenAt',
  'infoValidatedAt',
  'highSchoolValidatedAt',
  'parentsValidatedAt',
  'techInterestsValidatedAt',
  'generalInterestsValidatedAt',
  'interestsRecapSeenAt',
  'equipmentValidatedAt',
  'processingCompletedAt',
  'rulesSignedAt',
  'charterAcceptedAt',
] as const;

export type OnboardingTimestampField =
  (typeof ONBOARDING_TIMESTAMP_FIELDS)[number];

/**
 * `{ field: null }` patch covering every {@link ONBOARDING_TIMESTAMP_FIELDS},
 * meant to be spread into a `talent.update` `data` object. Centralised so a new
 * timestamp added to the schema only has to land in `ONBOARDING_TIMESTAMP_FIELDS`
 * for both reset paths to pick it up.
 */
export function clearOnboardingTimestamps(): Record<
  OnboardingTimestampField,
  null
> {
  return Object.fromEntries(
    ONBOARDING_TIMESTAMP_FIELDS.map((f) => [f, null]),
  ) as Record<OnboardingTimestampField, null>;
}

/**
 * The non-timestamp columns platform onboarding wrote on the talent: the
 * generated-PDF S3 key, the place of signature, the règlement version it
 * committed to, and the school year the whole projection describes, as distinct
 * from the profile data they fill in (school, parents, interests), which a
 * returning talent legitimately keeps.
 *
 * Owned here for the same reason as {@link ONBOARDING_TIMESTAMP_FIELDS}: every
 * path that returns a talent to a pre-onboarding state (admin reset, RGPD
 * anonymisation) must drop these alongside the gate timestamps, so a stale PDF
 * never outlives the signature it attests. Adding a new talent-signed artifact
 * here lights up both paths at once.
 *
 * Scope is the *talent's* signature only. The guardian's règlement co-signature
 * (`parentRules*`) and the parent-decided image-rights artifacts sit outside the
 * talent ladder and are cleared by their own flows, never by a talent reset.
 * `rulesFilePath` is the one shared key: it carries both signature blocks, but
 * voiding the talent's signature already invalidates the current render, so it
 * is dropped here and regenerated when either signer next commits.
 */
const TALENT_ONBOARDING_ARTIFACT_FIELDS = [
  'rulesFilePath',
  'rulesSignedCity',
  // Pins which text the voided signature committed to; it has to go with it,
  // or the next render reads a version nobody signed.
  'reglementVersion',
  // Dates the projection. Left behind, it would claim the (now empty) columns
  // are a dossier for the year in progress, and every year-narrowed reader
  // would agree.
  'onboardingSchoolYear',
] as const;

export type TalentOnboardingArtifactField =
  (typeof TALENT_ONBOARDING_ARTIFACT_FIELDS)[number];

/**
 * `{ field: null }` patch covering every {@link TALENT_ONBOARDING_ARTIFACT_FIELDS},
 * meant to be spread into a `talent.update` `data` object alongside
 * {@link clearOnboardingTimestamps}.
 */
export function clearTalentOnboardingArtifacts(): Record<
  TalentOnboardingArtifactField,
  null
> {
  return Object.fromEntries(
    TALENT_ONBOARDING_ARTIFACT_FIELDS.map((f) => [f, null]),
  ) as Record<TalentOnboardingArtifactField, null>;
}

export type OnboardingPhase = 'not-started' | 'in-progress' | 'complete';

export type OnboardingProgress = {
  /** Resume step, or `null` once complete. */
  step: OnboardingStep | null;
  /** Steps completed so far: 0 = not started, ORDER.length = complete. */
  completed: number;
  total: number;
  phase: OnboardingPhase;
};

/**
 * Classifies a talent's onboarding into a phase + completed-step count. The
 * distinction worth surfacing is `not-started` (account exists but the first
 * step — identity — is still untouched) vs `in-progress`: since identity is
 * written atomically, a talent resuming at it has done nothing yet, so
 * labelling it "1/7" would overstate their progress.
 */
export function describeOnboardingProgress(
  t: OnboardingStepFields,
): OnboardingProgress {
  const step = getOnboardingStep(t);
  const total = ONBOARDING_STEP_ORDER.length;
  const completed = step === null ? total : ONBOARDING_STEP_ORDER.indexOf(step);
  const phase: OnboardingPhase =
    step === null
      ? 'complete'
      : completed === 0
        ? 'not-started'
        : 'in-progress';
  return { step, completed, total, phase };
}
