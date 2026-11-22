import { z } from 'zod';
import { gatedQuery } from '#lib/server/remoteFunctions.ts';
import { loadFinishedOnboardingTimeline } from '#lib/server/services/onboardingDocuments.ts';

/**
 * Completion instant and type of every finished onboarding document (no
 * identity), for the per-period and per-type counts of `ExportMenu`.
 *
 * Asked when the menu opens rather than shipped with the page load: it is a
 * full talent-table scan, and that load re-runs every 5s for the live job feed.
 * It records no usage: its key counts downloads, and opening the menu is not
 * one. The export endpoint records it when the archive is actually asked for.
 */
export const onboardingExportTimeline = gatedQuery(
  { admin: true },
  z.undefined(),
  async () => {
    const timeline = await loadFinishedOnboardingTimeline();
    return timeline.map((d) => ({ at: d.finishedAt.getTime(), type: d.type }));
  },
);
