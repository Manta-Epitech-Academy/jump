import type { RequestHandler } from './$types';
import { loadFinishedOnboardingTimeline } from '#lib/server/services/onboardingDocuments.ts';

// Completion timeline of every finished onboarding document (type + instant, no
// identity). It feeds only the bulk-download menu's per-period / per-type counts,
// so it lives off the page load: that load re-runs every 5s for the live job
// feed, and this is a full talent-table scan we don't want on that cadence. The
// menu fetches it lazily when its popover opens instead. Admin-gated by the
// /staff/admin/* route guard, same as the sibling export endpoint.
// Records no usage: its key counts downloads, and opening the menu is not one.
// The sibling export endpoint records it when the archive is actually asked for.
export const GET: RequestHandler = async () => {
  const timeline = await loadFinishedOnboardingTimeline();
  // One shape for every export-menu timeline (`{ at, type? }`), so the menu needs
  // no per-caller parser.
  return Response.json({
    timeline: timeline.map((d) => ({
      at: d.finishedAt.toISOString(),
      type: d.type,
    })),
  });
};
