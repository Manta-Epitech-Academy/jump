import { prisma } from '$lib/server/db';
import { renderAuthoredMarkdown } from '$lib/markdown';
import { dbDateToKey } from '$lib/domain/eventPresence';
import { isHighlightOpen, type TalentHome } from '$lib/domain/talentHome';

/**
 * What a talent's home shows of their campus: its note, rendered, and its
 * highlighted event while that event's day has not passed.
 *
 * Takes the talent's effective campus, which the request hooks already resolve
 * into `locals.talentCampusId` (`resolveTalentCampus`, the campus of their
 * latest event). `null` is a talent with no enrolment at all: they belong to no
 * campus and get neither.
 */
export async function getTalentHome(
  campusId: string | null,
  now: Date = new Date(),
): Promise<TalentHome> {
  if (!campusId) return { note: null, highlight: null };

  const campus = await prisma.campus.findUnique({
    where: { id: campusId },
    select: {
      timezone: true,
      homeNote: { select: { markdown: true } },
      homeHighlight: {
        select: { title: true, summary: true, date: true, url: true },
      },
    },
  });
  const highlight = campus?.homeHighlight;

  return {
    note: campus?.homeNote
      ? renderAuthoredMarkdown(campus.homeNote.markdown)
      : null,
    highlight:
      highlight && isHighlightOpen(highlight.date, campus.timezone, now)
        ? { ...highlight, date: dbDateToKey(highlight.date) }
        : null,
  };
}
