import {
  ONBOARDING_GATES,
  ONBOARDING_LADDER,
  type OnboardingGate,
  type OnboardingStep,
} from '#lib/domain/talentOnboarding.ts';

/**
 * The onboarding ladder as Prisma filters, built from `ONBOARDING_LADDER` so a
 * step added there is counted here without anybody remembering to: the SQL
 * twins of `getOnboardingStep`, as `parentBlockedWhere` is of
 * `isParentDossierComplete` (`dossierCompliance.ts`).
 *
 * Shaped over the gate columns alone, deliberately not as a
 * `Prisma.TalentWhereInput`: the same filter reads the projection on `Talent`
 * AND a dossier row, the two where-inputs are branded per model even though the
 * columns are identical, and narrowing to the gates keeps a filter from quietly
 * growing a condition only one of the two carries. Spread it into either.
 */
type GateFilter = { [K in OnboardingGate]?: { not: null } | null };
export type RungFilter = GateFilter & { OR?: GateFilter[] };

const set = (gates: readonly OnboardingGate[]): GateFilter =>
  Object.fromEntries(gates.map((gate) => [gate, { not: null }]));

/** Every gate of the ladder set: the dossier is complete. */
export const ALL_GATES_SET: Readonly<Record<OnboardingGate, { not: null }>> =
  set(ONBOARDING_GATES) as Record<OnboardingGate, { not: null }>;

/**
 * Blocked on `step`: every earlier gate set, and this step's not all set, the
 * same cascade `getOnboardingStep` walks.
 */
export function rungFilter(step: OnboardingStep): RungFilter {
  const at = ONBOARDING_LADDER.findIndex((r) => r.step === step);
  const earlier = set(ONBOARDING_LADDER.slice(0, at).flatMap((r) => r.gates));
  const own = ONBOARDING_LADDER[at].gates;
  return own.length === 1
    ? { ...earlier, [own[0]]: null }
    : { ...earlier, OR: own.map((gate) => ({ [gate]: null })) };
}
