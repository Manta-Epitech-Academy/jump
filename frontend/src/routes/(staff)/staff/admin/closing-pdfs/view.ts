import { defineListChoice } from '$lib/domain/listView';
import { CLOSING_RECOMMENDATION_DISPLAY_ORDER } from '$lib/domain/closing';

/**
 * The closing PDFs' view, in the address every staff list shares
 * (`$lib/domain/listView`): the KPI tile pressed, the team's verdict (`avis`,
 * a `ClosingRecommendation`, the key the dev Closings list filters on too).
 * The bare address is every finalised closing. Read by the load, which feeds
 * it to a Prisma enum query: an unknown value reads as the default instead of
 * throwing.
 */
export const CLOSING_VERDICT_FILTER = defineListChoice(
  'avis',
  ['all', ...CLOSING_RECOMMENDATION_DISPLAY_ORDER] as const,
  'all',
);
