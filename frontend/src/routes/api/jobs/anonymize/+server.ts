import { cronJob } from '#lib/server/cronJob.ts';
import { AnonymizationService } from '#lib/server/services/anonymizationService.ts';

export const POST = cronJob('Anonymization job', async () => {
  const count = await AnonymizationService.anonymizeInactiveStudents();
  console.log(
    `[Job] Anonymization job completed: ${count} students processed.`,
  );
  return { success: true, count };
});
