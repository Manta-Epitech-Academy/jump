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
 * too much with the règlement-compliance signals to be a useful *cohort* metric
 * — the guardian's `parentRulesSignedAt` (canonical online co-signature) and
 * the per-event `stageCompliance.charteSigned` (offline-fallback staff toggle)
 * already cover that artifact. The signal stays interesting on a *single*
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
 * The talent's own signed-document artifacts produced *during platform
 * onboarding* — the generated-PDF S3 keys plus the place-of-signature metadata
 * that attest the talent's signature, as distinct from the profile data they
 * fill in (school, parents, interests), which a returning talent legitimately
 * keeps.
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
