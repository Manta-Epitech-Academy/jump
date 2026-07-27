/**
 * "Le stage en une phrase": what students actually said, in their own words.
 *
 * The only free text this tier returns, and the exception is deliberate. The
 * question exists on the interview grid precisely to collect a quotable line
 * ("idéal pour un témoignage com"), so a sentence here was written to be reused.
 * What is withheld is who said it: no name, no id, no link back to a talent.
 *
 * Everything else an interview holds in prose - the per-question notes, the
 * team's verdict - is staff writing about a named minor and stays out of this
 * tier entirely (see `interviewInsights.ts`).
 *
 * Verbatim, never trimmed or cleaned up: an edited testimonial is not a
 * testimonial. The definition says so, because a consumer that receives a rough
 * sentence will otherwise be tempted to polish it before quoting.
 */

import { prisma } from '$lib/server/db';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { participationWhere, scopeLabels } from './cohort';

export const TESTIMONIALS_DEFAULT_LIMIT = 50;
export const TESTIMONIALS_MAX_LIMIT = 200;

export type Testimonial = {
  /** The student's sentence, exactly as it was typed in. */
  quote: string;
  event: string;
  campus: string;
  /** Satisfaction out of 5 given in the same interview, when it was asked. */
  stars: number | null;
};

export type InterviewTestimonials = {
  filters: { schoolYear: string; campus: string; event: string; limit: number };
  collected: Metric;
  testimonials: Metric<Testimonial[]>;
  truncated: boolean;
};

export async function getInterviewTestimonials(
  scope: Scope = {},
  params: { limit?: number } = {},
): Promise<InterviewTestimonials> {
  const limit = Math.min(
    Math.max(params.limit ?? TESTIMONIALS_DEFAULT_LIMIT, 1),
    TESTIMONIALS_MAX_LIMIT,
  );
  const where = {
    participation: await participationWhere(scope),
    oneSentence: { not: null },
  };

  const [collected, rows] = await Promise.all([
    prisma.interview.count({ where }),
    prisma.interview.findMany({
      where,
      // Most recent first: a comms request is nearly always about the last
      // event, not a representative sample of the archive.
      orderBy: { conductedAt: 'desc' },
      take: limit,
      select: {
        oneSentence: true,
        satisfactionStars: true,
        campus: { select: { name: true } },
        participation: {
          select: {
            event: { select: { titre: true, publicName: true } },
          },
        },
      },
    }),
  ]);

  const testimonials = rows.flatMap<Testimonial>((row) => {
    const quote = row.oneSentence?.trim();
    if (!quote) return [];
    const event = row.participation.event;
    return [
      {
        quote,
        event: event.publicName?.trim() || event.titre,
        campus: row.campus.name,
        stars: row.satisfactionStars,
      },
    ];
  });

  return {
    filters: { ...scopeLabels(scope), limit },
    collected: metric(
      collected,
      "Nombre d'entretiens du périmètre où l'élève a laissé une phrase sur le stage. Tous ne sont pas renvoyés ci-dessous : la liste est plafonnée.",
    ),
    testimonials: metric(
      testimonials,
      `Phrases écrites par les élèves eux-mêmes à la question « Le stage en une phrase », des plus récentes aux plus anciennes, ${limit} au maximum. Elles sont rendues mot pour mot : citez-les telles quelles, sans les corriger ni les reformuler. Aucune n'est rattachée à un élève identifiable ; n'essayez pas de deviner qui a écrit quoi, et sachez qu'une phrase peut mentionner un prénom d'intervenant ou une activité.`,
    ),
    truncated: collected > testimonials.length,
  };
}
