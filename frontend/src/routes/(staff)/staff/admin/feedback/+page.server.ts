import { prisma } from '$lib/server/db';
import { loadForm, type FormSchema } from '$lib/domain/feedbackForms/schema';
import { STAGE_FORM_ID } from '$lib/domain/feedback';
import type { PageServerLoad } from './$types';

function aggregateAnswers(
  submissions: Array<{ answers: unknown }>,
  schema: FormSchema,
): Record<
  string,
  { type: string; distribution?: Record<string, number>; texts?: string[] }
> {
  const result: Record<
    string,
    { type: string; distribution?: Record<string, number>; texts?: string[] }
  > = {};

  for (const q of schema.questions) {
    if (q.type === 'gate') continue;

    if (q.type === 'text' || q.type === 'textarea') {
      const texts: string[] = [];
      for (const sub of submissions) {
        const answers = sub.answers as Record<string, unknown>;
        const val = answers[q.id];
        if (typeof val === 'string' && val.trim()) texts.push(val);
      }
      result[q.id] = { type: q.type, texts };
    } else {
      const dist: Record<string, number> = {};
      for (const opt of q.options ?? []) dist[opt] = 0;
      if (q.extraOptions) for (const opt of q.extraOptions) dist[opt] = 0;
      for (const sub of submissions) {
        const answers = sub.answers as Record<string, unknown>;
        const val = answers[q.id];
        if (typeof val === 'string') {
          dist[val] = (dist[val] ?? 0) + 1;
        } else if (Array.isArray(val)) {
          for (const v of val) {
            if (typeof v === 'string') dist[v] = (dist[v] ?? 0) + 1;
          }
        }
      }
      result[q.id] = { type: q.type, distribution: dist };
    }
  }

  return result;
}

export const load: PageServerLoad = async ({ url }) => {
  const campusFilter = url.searchParams.get('campus') ?? 'all';

  // Build event filter: stage_seconde, optionally scoped to a campus
  const eventWhere: Record<string, unknown> = { eventType: 'stage_seconde' };
  if (campusFilter !== 'all') {
    eventWhere.campusId = campusFilter;
  }

  const [submissions, participantCount, campuses] = await Promise.all([
    prisma.feedbackSubmission.findMany({
      where: { event: eventWhere, formId: STAGE_FORM_ID },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.participation.count({
      where: { event: eventWhere },
    }),
    prisma.campus.findMany({
      where: {
        events: { some: { eventType: 'stage_seconde' } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const schema = loadForm(STAGE_FORM_ID);

  const aggregated = schema ? aggregateAnswers(submissions, schema) : {};

  return {
    participantCount,
    submissionCount: submissions.length,
    schema,
    aggregated,
    campuses,
    selectedCampus: campusFilter,
  };
};
