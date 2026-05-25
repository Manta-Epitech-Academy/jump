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
 * too much with the staff-validated paper docs to be a useful *cohort* metric —
 * `stageCompliance.charteSigned` already covers that artifact. The signal stays
 * interesting on a *single* talent (did this person make it past the welcome
 * email, and where would impersonation drop me?), which is what this module is
 * scoped to.
 */

export type OnboardingStep =
  | 'identity'
  | 'school'
  | 'parents'
  | 'interests'
  | 'equipment'
  | 'processing'
  | 'rules';

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
