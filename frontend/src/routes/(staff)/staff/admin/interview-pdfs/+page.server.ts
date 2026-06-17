import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import {
  generateInterviewPdf,
  interviewPdfFilename,
} from '$lib/server/services/interviewPdfGenerator';
import { fail } from '@sveltejs/kit';

/** Prisma select for the full interview row needed by the PDF generator. */
const interviewSelect = {
  id: true,
  conductedAt: true,
  recommendation: true,
  verdictNote: true,
  satisfactionStars: true,
  oneSentence: true,
  discoveryChannel: true,
  motivation: true,
  orientationTalkAtSchool: true,
  passionateTeacher: true,
  wantsMore: true,
  techProjection: true,
  specialties: true,
  otherJobs: true,
  infoSources: true,
  nextYearEvents: true,
  teacherName: true,
  teacherSubject: true,
  discoveryChannelOther: true,
  specialtiesOther: true,
  otherJobsOther: true,
  infoSourcesOther: true,
  talent: { select: { id: true, prenom: true, nom: true } },
  staff: { select: { user: { select: { name: true } } } },
  campus: { select: { name: true } },
  participation: { select: { event: { select: { titre: true } } } },
} as const;

export const load: PageServerLoad = async ({ url, locals, depends }) => {
  depends('admin:interview-pdfs');

  const statusFilter = url.searchParams.get('reco') ?? 'all';
  const q = url.searchParams.get('q') ?? '';

  const where: Record<string, unknown> = { status: 'done' };

  if (statusFilter !== 'all') {
    where.recommendation = statusFilter;
  }

  if (q) {
    where.talent = {
      OR: [
        { prenom: { contains: q, mode: 'insensitive' } },
        { nom: { contains: q, mode: 'insensitive' } },
      ],
    };
  }

  const PAGE_SIZE = 100;

  const [interviews, matchCount, recoCounts] = await Promise.all([
    prisma.interview.findMany({
      where,
      select: {
        id: true,
        conductedAt: true,
        recommendation: true,
        talent: { select: { prenom: true, nom: true } },
        staff: { select: { user: { select: { name: true } } } },
        campus: { select: { name: true } },
        participation: { select: { event: { select: { titre: true } } } },
      },
      orderBy: { conductedAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.interview.count({ where }),
    prisma.interview.groupBy({
      by: ['recommendation'],
      where: { status: 'done' },
      _count: true,
    }),
  ]);

  // Build timeline for ExportMenu (conductedAt of all done interviews)
  const timeline = await prisma.interview.findMany({
    where: { status: 'done' },
    select: { conductedAt: true },
    orderBy: { conductedAt: 'desc' },
  });

  const recoMap: Record<string, number> = {};
  for (const r of recoCounts) {
    if (r.recommendation) recoMap[r.recommendation] = r._count;
  }
  const totalDone = recoCounts.reduce((s, r) => s + r._count, 0);

  return {
    filters: { reco: statusFilter, q },
    interviews: interviews.map((i) => ({
      id: i.id,
      conductedAt: i.conductedAt.toISOString(),
      recommendation: i.recommendation,
      talentName: `${i.talent.prenom} ${i.talent.nom}`,
      staffName: i.staff.user.name ?? 'Staff',
      campusName: i.campus.name,
      eventTitle: i.participation.event.titre,
    })),
    matchCount,
    truncated: matchCount > PAGE_SIZE,
    totalDone,
    recoCounts: recoMap,
    exportTimeline: timeline.map((t) => t.conductedAt.toISOString()),
    lastExportAt:
      locals.staffProfile?.interviewDocsExportedAt?.toISOString() ?? null,
  };
};

export const actions: Actions = {
  view: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('id') as string;
    if (!id) return fail(400, { error: 'Missing id' });

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: interviewSelect,
    });

    if (!interview) return fail(404, { error: 'Interview not found' });

    const pdf = await generateInterviewPdf(interview);
    const filename = interviewPdfFilename(interview);

    // Return as base64 data URL for inline viewing
    const b64 = Buffer.from(pdf).toString('base64');
    return { url: `data:application/pdf;base64,${b64}`, filename };
  },
};
