import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Shared submit behaviour for every onboarding step form (and the go-back form).
 *
 * The wizard never navigates between steps: `data.step` is recomputed from the
 * DB on each `invalidateAll`, so SvelteKit never clears the page `form` prop on
 * its own. `update()` is what keeps `form` in sync with the step now shown — on
 * success it applies the (error-free) result and invalidates the load, advancing
 * the step; on failure it applies the field errors in place.
 *
 * The previous `if (success) { invalidateAll(); return }` advanced the step but
 * left a prior failure's `{ step, errors }` stranded on `form`. It stayed
 * invisible (each step gates on `form.step === data.step`) until the talent
 * returned to that step, which then re-rendered already-fixed errors. Routing
 * every result through `update()` clears that stale state.
 */
export function onboardingSubmit(
  setSubmitting?: (value: boolean) => void,
): SubmitFunction {
  return () => {
    setSubmitting?.(true);
    return async ({ result, update }) => {
      await update();
      // On success the step advances and this component is torn down, so leave
      // `submitting` as-is — flipping it back would flash the button re-enabling
      // mid-exit. On failure we stay on the step, so release it.
      if (result.type !== 'success') setSubmitting?.(false);
    };
  };
}
