import ejs from 'ejs';
import { withBrowser } from '../infra/browserPool';
import { epitechLogoSvg } from '../templates/epitechLogo';
import interviewTemplate from '../templates/interview-synthesis.html?raw';
import {
  INTERVIEW_SECTIONS,
  INTERVIEW_RECOMMENDATIONS,
  type InterviewQuestion,
  type ChoiceQuestion,
} from '$lib/domain/interview';
import type { InterviewRecommendation } from '@prisma/client';

/** The full Interview row with its relations, as loaded by the admin page. */
export type InterviewForPdf = {
  id: string;
  conductedAt: Date;
  recommendation: InterviewRecommendation | null;
  verdictNote: string | null;
  satisfactionStars: number | null;
  oneSentence: string | null;
  // Single-choice enum fields (string | null)
  discoveryChannel: string | null;
  motivation: string | null;
  orientationTalkAtSchool: string | null;
  passionateTeacher: string | null;
  wantsMore: string | null;
  // Multi-choice enum arrays
  techProjection: string[];
  specialties: string[];
  otherJobs: string[];
  infoSources: string[];
  nextYearEvents: string[];
  // Reveal free-text fields
  teacherName: string | null;
  teacherSubject: string | null;
  discoveryChannelOther: string | null;
  specialtiesOther: string | null;
  otherJobsOther: string | null;
  infoSourcesOther: string | null;
  // Relations
  talent: { prenom: string; nom: string };
  staff: { user: { name: string | null } };
  campus: { name: string };
  participation: { event: { titre: string | null } };
};

type TemplateQuestion = {
  kind: string;
  field: string;
  label: string;
  value: string | string[] | number | null;
  max?: number;
  revealText?: string | null;
};

function resolveLabel(q: ChoiceQuestion, value: string | null): string | null {
  if (!value) return null;
  const opt = q.options.find((o) => o.value === value);
  return opt?.label ?? value;
}

function resolveLabels(q: ChoiceQuestion, values: string[]): string[] {
  return values.map((v) => {
    const opt = q.options.find((o) => o.value === v);
    return opt?.label ?? v;
  });
}

function getRevealText(
  q: InterviewQuestion,
  interview: InterviewForPdf,
): string | null {
  if (q.kind !== 'single' && q.kind !== 'multi') return null;
  const cq = q as ChoiceQuestion;
  if (!cq.reveal) return null;
  const parts: string[] = [];
  for (const rf of cq.reveal.fields) {
    const val = (interview as Record<string, unknown>)[rf.field];
    if (typeof val === 'string' && val.trim()) {
      parts.push(`${rf.label} : ${val.trim()}`);
    }
  }
  return parts.length > 0 ? parts.join(' / ') : null;
}

function buildSections(interview: InterviewForPdf) {
  return INTERVIEW_SECTIONS.map((section) => ({
    title: section.title,
    questions: section.questions.map((q): TemplateQuestion => {
      const raw = (interview as Record<string, unknown>)[q.field];

      if (q.kind === 'rating') {
        return {
          kind: 'rating',
          field: q.field,
          label: q.label,
          value: (raw as number | null) ?? null,
          max: q.max,
        };
      }

      if (q.kind === 'text') {
        return {
          kind: 'text',
          field: q.field,
          label: q.label,
          value: (raw as string | null) ?? null,
        };
      }

      // Choice questions (single or multi)
      const cq = q as ChoiceQuestion;
      if (cq.kind === 'multi') {
        const arr = Array.isArray(raw) ? (raw as string[]) : [];
        return {
          kind: 'multi',
          field: q.field,
          label: q.label,
          value: resolveLabels(cq, arr),
          revealText: getRevealText(q, interview),
        };
      }

      // single
      return {
        kind: 'single',
        field: q.field,
        label: q.label,
        value: resolveLabel(cq, raw as string | null),
        revealText: getRevealText(q, interview),
      };
    }),
  }));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export async function generateInterviewPdf(
  interview: InterviewForPdf,
): Promise<Uint8Array<ArrayBuffer>> {
  const recoKey = interview.recommendation;
  const recoLabel = recoKey
    ? (INTERVIEW_RECOMMENDATIONS[recoKey]?.label ?? recoKey)
    : null;

  const data = {
    logoSvg: epitechLogoSvg,
    talentName: `${interview.talent.prenom} ${interview.talent.nom}`,
    staffName: interview.staff.user.name ?? 'Staff',
    campusName: interview.campus.name,
    conductedAt: formatDate(interview.conductedAt),
    eventTitle: interview.participation.event.titre,
    sections: buildSections(interview),
    recommendation: recoLabel,
    recommendationKey: recoKey,
    verdictNote: interview.verdictNote,
  };

  const htmlContent = await ejs.render(
    interviewTemplate,
    { data },
    { async: true },
  );

  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    try {
      await page.setContent(htmlContent, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');

      const pdfBuffer = await page.pdf({
        width: '794px',
        height: '1123px',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      return new Uint8Array(pdfBuffer) as Uint8Array<ArrayBuffer>;
    } finally {
      await page.close();
    }
  });
}

/** Sanitized filename for a single interview PDF. */
export function interviewPdfFilename(interview: {
  talent: { prenom: string; nom: string };
  conductedAt: Date;
}): string {
  const name = `${interview.talent.prenom}-${interview.talent.nom}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .toLowerCase();
  const date = interview.conductedAt.toISOString().slice(0, 10);
  return `entretien-${name}-${date}.pdf`;
}
