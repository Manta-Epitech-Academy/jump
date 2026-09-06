/**
 * Single source of truth for the inactivity data-retention period.
 *
 * Two surfaces MUST agree on this number, or we breach our own privacy notice
 * (GDPR art. 13(2)(a): the retention period we disclose must match what we do,
 * art. 5(1)(e) storage limitation):
 *   - the charter the talent signs (the onboarding rules step,
 *     `(talent)/onboarding/components/RulesStep.svelte`), and
 *   - the anonymisation cron that enforces it (`anonymizationService.ts`).
 *
 * Both import this constant rather than hard-coding the figure, so they cannot
 * silently drift apart.
 *
 * Changing it here changes both. Bumping it upward is a disclosure change:
 * talents signed the previous figure, so coordinate with the PO/legal first.
 */
export const DATA_RETENTION_MONTHS = 18;
