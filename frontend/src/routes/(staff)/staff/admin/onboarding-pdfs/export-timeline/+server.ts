import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadFinishedOnboardingTimeline } from '$lib/server/services/onboardingDocuments';

// Completion timeline of every finished onboarding document (type + instant, no
// identity). It feeds only the bulk-download menu's per-period / per-type counts,
// so it lives off the page load: that load re-runs every 5s for the live job
// feed, and this is a full talent-table scan we don't want on that cadence. The
// menu fetches it lazily when its popover opens instead. Admin-gated by the
// /staff/admin/* route guard, same as the sibling export endpoint.
export const GET: RequestHandler = async () => {
  const timeline = await loadFinishedOnboardingTimeline();
  // One shape for every export-menu timeline (`{ at, type? }`), so the menu needs
  // no per-caller parser.
  return json({
    timeline: timeline.map((d) => ({
      at: d.finishedAt.toISOString(),
      type: d.type,
    })),
  });
};
