import { describe, it, expect } from 'vitest';
import {
  getOnboardingStep,
  ONBOARDING_GATES,
  ONBOARDING_STEP_ORDER,
  type OnboardingStepFields,
} from '#lib/domain/talentOnboarding.ts';
import { ALL_GATES_SET, rungFilter, type RungFilter } from './onboardingLadder';

/**
 * The funnel's SQL filters against the domain function they twin. Each filter
 * is evaluated here the way Postgres would on a dossier, over every dossier
 * the ladder can hold (each gate set or not), and has to pick exactly the
 * dossiers `getOnboardingStep` puts on that rung.
 */
type Clause = { not: null } | null | undefined;
const holds = (clause: Clause, value: unknown): boolean =>
  clause === undefined || (clause === null ? value == null : value != null);

function matches(filter: RungFilter, d: OnboardingStepFields): boolean {
  const { OR, ...gates } = filter;
  const own = Object.entries(gates).every(([gate, clause]) =>
    holds(clause as Clause, d[gate as keyof OnboardingStepFields]),
  );
  return own && (!OR || OR.some((alt) => matches(alt, d)));
}

const everyDossier: OnboardingStepFields[] = Array.from(
  { length: 2 ** ONBOARDING_GATES.length },
  (_, bits) =>
    Object.fromEntries(
      ONBOARDING_GATES.map((gate, i) => [gate, bits & (1 << i) ? 'x' : null]),
    ) as OnboardingStepFields,
);

describe('the onboarding ladder as SQL filters', () => {
  it('puts each dossier on the rung getOnboardingStep reads', () => {
    for (const d of everyDossier) {
      const onRungs = ONBOARDING_STEP_ORDER.filter((step) =>
        matches(rungFilter(step), d),
      );
      const step = getOnboardingStep(d);
      expect(onRungs).toEqual(step ? [step] : []);
      expect(matches(ALL_GATES_SET, d)).toBe(step === null);
    }
  });
});
