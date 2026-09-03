import { prisma } from '$lib/server/db';

/** 5s of settling budget: these tests stub the renderer, so it is generous. */
const SETTLE_ATTEMPTS = 50;
const SETTLE_INTERVAL_MS = 100;

/** The two non-terminal job statuses; `success` and `error` are both done. */
const IN_FLIGHT = ['pending', 'processing'];

/**
 * Run every onboarding PDF job a talent still owes, then wait for the queue to
 * settle.
 *
 * The waiting half is the point, and its absence is a race that had already been
 * seen in CI on `imageRightsAnnual` (PR #293) and was reproduced locally on
 * `onboardingDocumentArtifact` - the same symptom both times, a
 * `*FilePath` read back as `null` where a key was expected, and a re-run of the
 * identical commit passing.
 *
 * The mechanism: the services enqueue and then fire their own
 * `void runOnboardingPdfJob(id)`, so by the time a test drains, a job can
 * already be claimed. `runOnboardingPdfJob` returns immediately on a claim it
 * does not win (`claimed.count === 0`, and Postgres guarantees exactly one
 * winner), so the drain loop can finish while the render that actually owns the
 * job is still writing its key back. The assertion then reads a dossier the
 * render has not reached yet.
 *
 * So a drain that only runs the jobs it can claim proves nothing. Settling is
 * "no job of this talent is `pending` or `processing`" - the two non-terminal
 * statuses. Deliberately not "every job is `success`": a job that genuinely
 * failed ends `error`, and waiting for it to succeed would hang instead of
 * letting the test assert on the failure.
 *
 * `runJob` is passed in rather than imported here, because its callers load the
 * service through a top-level `await import` so it resolves against their
 * `vi.mock` of the renderer and the storage. Importing it statically would work
 * by accident of mock hoisting; taking it as an argument makes the dependency
 * the caller's, visibly.
 */
export async function drainPdfJobs(
  talentId: string,
  runJob: (jobId: string) => Promise<void>,
): Promise<void> {
  const jobs = await prisma.onboardingPdfJob.findMany({
    where: { talentId, status: { not: 'success' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  for (const job of jobs) await runJob(job.id);

  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    const inFlight = await prisma.onboardingPdfJob.count({
      where: { talentId, status: { in: IN_FLIGHT } },
    });
    if (inFlight === 0) return;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
  }

  // Loud rather than silent: a timeout here means a render is genuinely stuck,
  // which is worth a message that says so instead of the null-shaped assertion
  // failure it used to produce.
  throw new Error(
    `Les jobs PDF du talent ${talentId} ne se sont pas stabilisés en ${
      (SETTLE_ATTEMPTS * SETTLE_INTERVAL_MS) / 1000
    }s.`,
  );
}
