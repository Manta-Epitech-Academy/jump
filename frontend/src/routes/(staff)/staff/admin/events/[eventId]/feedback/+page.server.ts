import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { computeFormStats, type FormStats } from '$lib/server/feedbackStats';
import type { PageServerLoad } from './$types';

/** The two weekly bilan forms this admin page reports on, in display order. */
const WEEK_FORM_SLUGS = ['w1', 'w2'] as const;

type AggEntry = {
  type: string;
  distribution?: Record<string, number>;
  texts?: string[];
};

/** Projects normalized stats into the page's {schema, aggregated} shape. */
function toView(formId: string, stats: FormStats | null) {
  const aggregated: Record<string, AggEntry> = {};
  for (const q of stats?.questions ?? []) {
    if (q.type === 'text' || q.type === 'textarea') {
      aggregated[q.questionId] = { type: q.type, texts: q.freeTexts };
    } else {
      aggregated[q.questionId] = {
        type: q.type,
        distribution: Object.fromEntries(
          q.options.map((o) => [o.label, o.count]),
        ),
      };
    }
  }
  return {
    formId,
    schema: {
      questions: (stats?.questions ?? []).map((q) => ({
        id: q.questionId,
        prompt: q.prompt,
        type: q.type,
        identity: q.identity,
      })),
    },
    submissionCount: stats?.totalSubmissions ?? 0,
    aggregated,
  };
}

export const load: PageServerLoad = async ({ params }) => {
  const [event, formRows, participantCount] = await Promise.all([
    prisma.event.findUnique({
      where: { id: params.eventId },
      select: { id: true, titre: true },
    }),
    prisma.feedback_Form.findMany({
      where: { slug: { in: [...WEEK_FORM_SLUGS] } },
      select: { id: true, slug: true },
    }),
    prisma.participation.count({ where: { eventId: params.eventId } }),
  ]);

  if (!event) error(404, 'Événement introuvable');

  const forms = await Promise.all(
    WEEK_FORM_SLUGS.map(async (slug) => {
      const row = formRows.find((f) => f.slug === slug);
      const stats = row
        ? await computeFormStats(row.id, { eventId: params.eventId })
        : null;
      return toView(slug, stats);
    }),
  );

  return { event, participantCount, forms };
};
