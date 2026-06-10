import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { loadForm, type FormSchema } from '$lib/domain/feedbackForms/schema';
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

export const load: PageServerLoad = async ({ params }) => {
  const [event, submissions, participantCount] = await Promise.all([
    prisma.event.findUnique({
      where: { id: params.eventId },
      select: { id: true, titre: true },
    }),
    prisma.feedbackSubmission.findMany({
      where: { eventId: params.eventId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.participation.count({ where: { eventId: params.eventId } }),
  ]);

  if (!event) error(404, 'Evenement introuvable');

  const w1Schema = loadForm('w1');
  const w2Schema = loadForm('w2');

  const byForm = new Map<string, typeof submissions>();
  for (const sub of submissions) {
    const arr = byForm.get(sub.formId) ?? [];
    arr.push(sub);
    byForm.set(sub.formId, arr);
  }

  const forms = [];

  if (w1Schema) {
    const subs = byForm.get('w1') ?? [];
    forms.push({
      formId: 'w1',
      schema: w1Schema,
      submissionCount: subs.length,
      aggregated: aggregateAnswers(subs, w1Schema),
    });
  }

  if (w2Schema) {
    const subs = byForm.get('w2') ?? [];
    forms.push({
      formId: 'w2',
      schema: w2Schema,
      submissionCount: subs.length,
      aggregated: aggregateAnswers(subs, w2Schema),
    });
  }

  return { event, participantCount, forms };
};
