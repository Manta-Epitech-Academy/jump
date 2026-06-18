import ejs from 'ejs';
import { withBrowser } from '../infra/browserPool';
import { epitechLogoSvg } from '../templates/epitechLogo';
import interviewTemplate from '../templates/interview-synthesis.html?raw';
import {
  INTERVIEW_SYNTHESIS_SECTIONS,
  INTERVIEW_RECOMMENDATIONS,
  type InterviewQuestion,
  type ChoiceQuestion,
} from '$lib/domain/interview';
import type { InterviewRecommendation, Prisma } from '@prisma/client';

/**
 * The exact `Interview` selection the PDF needs, defined once and shared by the
 * admin page's inline viewer and the bulk ZIP export, so the two selects can
 * never drift from each other or from the schema. (They did once: the
 * questionnaire's free-text model changed under a merge and both selects kept
 * reading dropped columns.) `InterviewForPdf` is derived from this, so adding a
 * column here flows straight to the consumer type.
 */
export const interviewPdfSelect = {
  id: true,
  conductedAt: true,
  recommendation: true,
  verdictNote: true,
  satisfactionStars: true,
  oneSentence: true,
  // Single-choice enum fields.
  discoveryChannel: true,
  motivation: true,
  orientationTalkAtSchool: true,
  passionateTeacher: true,
  wantsMore: true,
  // Multi-choice enum arrays.
  techProjection: true,
  specialties: true,
  otherJobs: true,
  infoSources: true,
  nextYearEvents: true,
  // Per-question free-text notes (one per question; see domain/interview
  // NOTE_FIELDS). Read generically through each question's `note.field`.
  discoveryChannelNote: true,
  motivationNote: true,
  specialtiesNote: true,
  orientationTalkNote: true,
  passionateTeacherNote: true,
  techProjectionNote: true,
  otherJobsNote: true,
  infoSourcesNote: true,
  wantsMoreNote: true,
  satisfactionNote: true,
  nextYearEventsNote: true,
  // Relations.
  talent: { select: { prenom: true, nom: true } },
  staff: { select: { user: { select: { name: true } } } },
  campus: { select: { name: true } },
  participation: { select: { event: { select: { titre: true } } } },
} as const satisfies Prisma.InterviewSelect;

/** The full Interview row with relations the generator consumes, derived from
 *  {@link interviewPdfSelect} so it stays in lockstep with the query. */
export type InterviewForPdf = Prisma.InterviewGetPayload<{
  select: typeof interviewPdfSelect;
}>;

type TemplateQuestion = {
  kind: string;
  field: string;
  label: string;
  /** The structured answer: a label for single, the list of selected labels for
   *  multi (rendered as discrete chips, not joined, since labels can contain
   *  commas and slashes), the testimony for text, or the score for rating.
   *  Free-text notes ride the separate `note` field. */
  value: string | string[] | number | null;
  max?: number;
  note?: string | null;
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

/** The dev's free-text note under a question, if any. Always offered now (no
 *  longer gated by an "Autre" pick), so it can stand alone or annotate a chip
 *  answer. Read generically from the question's `note.field`. */
function getNoteText(
  q: InterviewQuestion,
  interview: InterviewForPdf,
): string | null {
  const note = 'note' in q ? q.note : undefined;
  if (!note) return null;
  const val = (interview as Record<string, unknown>)[note.field];
  return typeof val === 'string' && val.trim() ? val.trim() : null;
}

function buildSections(interview: InterviewForPdf) {
  return INTERVIEW_SYNTHESIS_SECTIONS.map((section) => ({
    title: section.title,
    questions: section.questions.map((q): TemplateQuestion => {
      const raw = (interview as Record<string, unknown>)[q.field];
      const note = getNoteText(q, interview);

      if (q.kind === 'rating') {
        return {
          kind: 'rating',
          field: q.field,
          label: q.label,
          value: (raw as number | null) ?? null,
          max: q.max,
          note,
        };
      }

      if (q.kind === 'text') {
        return {
          kind: 'text',
          field: q.field,
          label: q.label,
          value: (raw as string | null) ?? null,
          note,
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
          note,
        };
      }

      // single
      return {
        kind: 'single',
        field: q.field,
        label: q.label,
        value: resolveLabel(cq, raw as string | null),
        note,
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

/** Display name for the masthead: first name title-cased (each word, so
 *  "Jean-Pierre" survives), last name fully uppercased, e.g. "Lucie BARTOLETTI".
 *  Mirrors the PDF filename's prenom/NOM convention. */
function formatTalentName(prenom: string, nom: string): string {
  const titleCase = (s: string) =>
    s
      .toLocaleLowerCase('fr')
      .replace(
        /(^|[\s'-])(\p{L})/gu,
        (_, sep, ch) => sep + ch.toLocaleUpperCase('fr'),
      );
  return `${titleCase(prenom)} ${nom.toLocaleUpperCase('fr')}`;
}

export async function generateInterviewPdf(
  interview: InterviewForPdf,
): Promise<Uint8Array<ArrayBuffer>> {
  const recoKey = interview.recommendation;
  const recoLabel = recoKey
    ? (INTERVIEW_RECOMMENDATIONS[recoKey]?.label ?? recoKey)
    : null;

  const data = {
    // The masthead sits on full-bleed brand blue, so the logo ships white. The
    // source asset is the blue wordmark (every path filled #013AFB); recolour it
    // here rather than maintaining a second 26 KB copy.
    logoSvgWhite: epitechLogoSvg.replaceAll('#013AFB', '#ffffff'),
    talentName: formatTalentName(interview.talent.prenom, interview.talent.nom),
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

/**
 * Filename verdict slug per recommendation, best \u2192 worst. The PDF leads with
 * the verdict so an exported batch sorts by potential. Kept here (not the enum
 * labels) because these are file-naming terms chosen for the export, distinct
 * from the in-app recommendation labels. `null` recommendation \u2192 no verdict.
 */
const FILENAME_VERDICT: Record<InterviewRecommendation, string> = {
  tres_compatible: 'fort_potentiel',
  bon_profil: 'potentiel',
  indecis: 'a_confirmer',
  pas_interesse: 'faible_potentiel',
};

/** Sanitized filename for a single interview PDF, prefixed by the verdict. */
export function interviewPdfFilename(interview: {
  talent: { prenom: string; nom: string };
  recommendation: InterviewRecommendation | null;
}): string {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '');
  const prenom = slug(interview.talent.prenom);
  const nom = slug(interview.talent.nom).toUpperCase();
  const verdict = interview.recommendation
    ? FILENAME_VERDICT[interview.recommendation]
    : 'sans_verdict';
  return `${verdict}-entretien-${prenom}_${nom}.pdf`;
}
