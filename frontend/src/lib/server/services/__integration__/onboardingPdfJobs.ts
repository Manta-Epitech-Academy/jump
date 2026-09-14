import { prisma } from '$lib/server/db';

/**
 * Waits until a talent's onboarding PDF queue is empty, running what it can.
 *
 * Shared because the race below is a property of the pipeline and not of one
 * suite: both suites that sign a document and then assert on the artifact had
 * their own copy of a drain that did not wait, and both were intermittently red
 * for it (`imageRightsAnnual`, `onboardingDocumentArtifact`).
 *
 * **Running a job is not the same as draining the queue**, and that difference
 * IS the flake. `runOnboardingPdfJob` is fired by the service itself as
 * `void runOnboardingPdfJob(id)` the moment the signing transaction commits, so
 * by the time a test asks for the outstanding rows the job is usually already
 * `processing`. `claimableJobWhere` then refuses the test's own call - correctly,
 * since somebody is rendering it - and the call returns having done nothing. The
 * old drain read that as "drained" and the assertion ran against a storage stub
 * the in-flight render had not reached yet, so `saved.get(key)` came back
 * `undefined` perhaps one run in ten. A re-run of the same commit passed, which
 * is what made it cost a diff hunt every time.
 *
 * So this polls the queue rather than the runner: it is done when no row for the
 * talent is left outside `success`, whoever rendered it. A row this test CAN
 * claim (`pending`, or one stranded long enough to be reclaimable) is run on
 * every pass, so a queue nobody else is draining still empties.
 *
 * Two failures are reported rather than waited out, because both look identical
 * from a timeout and neither is this helper's doing: a job that comes back
 * `error` after we invoked it carries the generator's own message, and a queue
 * still moving at the deadline names what is in it and in which state.
 */
export async function drainOnboardingPdfJobs(opts: {
  talentId: string;
  /**
   * `runOnboardingPdfJob`, passed in rather than imported. Each suite mocks the
   * generator and the storage before importing the service, so the suite owns
   * that import and this helper must not open a second, unmocked one.
   */
  run: (jobId: string) => Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  const { talentId, run, timeoutMs = 10_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  const invoked = new Set<string>();

  for (;;) {
    const outstanding = await prisma.onboardingPdfJob.findMany({
      where: { talentId, status: { not: 'success' } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        documentType: true,
        schoolYear: true,
        errorMessage: true,
      },
    });
    if (outstanding.length === 0) return;

    const failed = outstanding.find(
      (job) => job.status === 'error' && invoked.has(job.id),
    );
    if (failed) {
      throw new Error(
        `Onboarding PDF job ${failed.documentType}/${failed.schoolYear} failed: ` +
          `${failed.errorMessage ?? '(no message recorded)'}`,
      );
    }

    for (const job of outstanding) {
      invoked.add(job.id);
      await run(job.id);
    }

    if (Date.now() > deadline) {
      const left = outstanding
        .map((job) => `${job.documentType}/${job.schoolYear} (${job.status})`)
        .join(', ');
      throw new Error(
        `Onboarding PDF jobs still outstanding after ${timeoutMs}ms: ${left}. ` +
          `A job left in 'processing' means the render the service fired never ` +
          `settled, which is a hang rather than a slow test.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
