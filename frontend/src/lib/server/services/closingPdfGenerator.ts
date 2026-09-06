import ejs from 'ejs';
import { renderPdf } from '../infra/documentRenderer';
import { fontFaceCss } from '../templates/fonts';
import { epitechLogoSvg } from '../templates/epitechLogo';
import closingTemplate from '../templates/closing-synthesis.html?raw';
import {
  CLOSING_RECOMMENDATIONS,
  RETIRED_SECTION_TITLE,
  type ClosingGrid,
} from '$lib/domain/closing';
import type { ClosingRecommendation, Prisma } from '@prisma/client';
import { FORMER_STAFF_LABEL } from '$lib/domain/staff';

/**
 * The synthesis PDF for one closing, generated on demand and never stored: it is
 * a view of relational data, not a frozen artifact.
 *
 * Answers carry their own question and option ROWS, not just ids. That is what
 * makes this safe: every label the document prints is resolved through a foreign
 * key rather than looked up in a catalogue that might no longer contain it, so a
 * question retired from a grid still renders its own wording years later. The
 * grid is consulted only for ORDER and section titles, and anything recorded
 * against a question the grid no longer asks is printed under an explicit
 * heading rather than silently dropped.
 */

/**
 * The exact `Closing_Record` selection the PDF needs, defined once and shared by
 * the admin page's inline viewer and the bulk ZIP export, so the two selects can
 * never drift from each other or from the schema. (They did once, when the
 * questionnaire's free-text model changed under a merge and both selects kept
 * reading dropped columns.) `ClosingForPdf` is derived from this, so adding a
 * field here flows straight to the consumer type.
 */
export const closingPdfSelect = {
  id: true,
  conductedAt: true,
  recommendation: true,
  verdictNote: true,
  templateId: true,
  answers: {
    select: {
      ratingValue: true,
      freeText: true,
      note: true,
      question: { select: { id: true, label: true, kind: true, max: true } },
      selectedOptions: {
        select: {
          option: { select: { id: true, label: true, position: true } },
        },
      },
    },
  },
  talent: { select: { prenom: true, nom: true, externalId: true } },
  staff: { select: { user: { select: { name: true } } } },
  campus: { select: { name: true } },
  event: { select: { titre: true } },
} as const satisfies Prisma.Closing_RecordSelect;

/** The full record with relations the generator consumes, derived from
 *  {@link closingPdfSelect} so it stays in lockstep with the query. */
export type ClosingForPdf = Prisma.Closing_RecordGetPayload<{
  select: typeof closingPdfSelect;
}>;

type ClosingAnswerRow = ClosingForPdf['answers'][number];

export type SynthesisQuestion = {
  kind: string;
  label: string;
  /** The structured answer: a label for single, the list of selected labels for
   *  multi (rendered as discrete chips, not joined, since labels can contain
   *  commas and slashes), the testimony for text, or the score for rating.
   *  Free-text notes ride the separate `note` field. */
  value: string | string[] | number | null;
  max?: number;
  note?: string | null;
};

/** The labels an answer picked, in their question's own option order, so two
 *  students who picked the same things read the same way. */
function pickedLabels(answer: ClosingAnswerRow): string[] {
  return [...answer.selectedOptions]
    .sort((a, b) => a.option.position - b.option.position)
    .map((s) => s.option.label);
}

function renderAnswer(
  label: string,
  kind: string,
  answer: ClosingAnswerRow | undefined,
  max: number | null,
): SynthesisQuestion {
  const note = answer?.note?.trim() || null;
  if (kind === 'rating') {
    return {
      kind: 'rating',
      label,
      value: answer?.ratingValue ?? null,
      ...(max != null ? { max } : {}),
      note,
    };
  }
  if (kind === 'text') {
    return { kind: 'text', label, value: answer?.freeText ?? null, note };
  }
  if (kind === 'multi') {
    return {
      kind: 'multi',
      label,
      value: answer ? pickedLabels(answer) : [],
      note,
    };
  }
  return {
    kind: 'single',
    label,
    value: answer ? (pickedLabels(answer)[0] ?? null) : null,
    note,
  };
}

/**
 * The synthesis the document prints: one entry per question of the grid, in its
 * read-back order, plus anything answered under a question the grid no longer
 * asks.
 *
 * Exported because this is the whole silent-failure surface of the document. Its
 * predecessor indexed the row by a catalogue's field name through a
 * `Record<string, unknown>` cast, so a renamed column printed "Non renseigné" for
 * every question and dropped every note, with nothing failing anywhere. Rendering
 * a PDF to prove that needs a browser; checking this mapping does not.
 */
export function buildClosingSynthesis(
  record: ClosingForPdf,
  grid: ClosingGrid,
): { title: string; questions: SynthesisQuestion[] }[] {
  const byQuestion = new Map(record.answers.map((a) => [a.question.id, a]));
  const asked = new Set<string>();

  const sections = grid.synthesisSections.map((section) => ({
    title: section.title,
    questions: section.questions.map((q) => {
      asked.add(q.id);
      // The grid's own wording, which is what was read aloud to the student.
      return renderAnswer(q.label, q.kind, byQuestion.get(q.id), q.max);
    }),
  }));

  // Anything answered under a question this grid no longer asks. Never dropped:
  // the answer is a fact about a real conversation, and its own question row
  // still holds the wording it was given under.
  const retired = record.answers.filter((a) => !asked.has(a.question.id));
  if (retired.length > 0) {
    sections.push({
      title: RETIRED_SECTION_TITLE,
      questions: retired.map((a) =>
        renderAnswer(a.question.label, a.question.kind, a, a.question.max),
      ),
    });
  }

  return sections;
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

export async function generateClosingPdf(
  record: ClosingForPdf,
  grid: ClosingGrid,
): Promise<Uint8Array<ArrayBuffer>> {
  const recoKey = record.recommendation;
  const recoLabel = recoKey
    ? (CLOSING_RECOMMENDATIONS[recoKey]?.label ?? recoKey)
    : null;

  const data = {
    fontFaces: fontFaceCss('anton', 'plexSans', 'spaceMono'),
    // The masthead sits on full-bleed brand blue, so the logo ships white. The
    // source asset is the blue wordmark (every path filled #013AFB); recolour it
    // here rather than maintaining a second 26 KB copy.
    logoSvgWhite: epitechLogoSvg.replaceAll('#013AFB', '#ffffff'),
    talentName: formatTalentName(record.talent.prenom, record.talent.nom),
    staffName: record.staff?.user?.name ?? FORMER_STAFF_LABEL,
    campusName: record.campus.name,
    conductedAt: formatDate(record.conductedAt),
    eventTitle: record.event.titre,
    sections: buildClosingSynthesis(record, grid),
    recommendation: recoLabel,
    recommendationKey: recoKey,
    verdictNote: record.verdictNote,
  };

  const htmlContent = await ejs.render(
    closingTemplate,
    { data },
    { async: true },
  );

  return renderPdf({
    html: htmlContent,
    page: { width: '794px', height: '1123px' },
  });
}

/**
 * Filename verdict slug per recommendation, best → worst. The PDF leads with the
 * verdict so an exported batch sorts by potential. Kept here (not the enum
 * labels) because these are file-naming terms chosen for the export, distinct
 * from the in-app recommendation labels. `null` recommendation → no verdict.
 */
const FILENAME_VERDICT: Record<ClosingRecommendation, string> = {
  tres_compatible: 'fort_potentiel',
  bon_profil: 'potentiel',
  indecis: 'a_confirmer',
  pas_interesse: 'faible_potentiel',
};

/** Sanitized filename for a single closing PDF, prefixed by the verdict and
 *  suffixed by the talent's Salesforce externalId (omitted when unsynced). */
export function closingPdfFilename(record: {
  talent: { prenom: string; nom: string; externalId: string | null };
  recommendation: ClosingRecommendation | null;
}): string {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '');
  const prenom = slug(record.talent.prenom);
  const nom = slug(record.talent.nom).toUpperCase();
  const verdict = record.recommendation
    ? FILENAME_VERDICT[record.recommendation]
    : 'sans_verdict';
  const externalId = slug(record.talent.externalId ?? '');
  const suffix = externalId ? `-${externalId}` : '';
  return `${verdict}-closing-${prenom}_${nom}${suffix}.pdf`;
}
