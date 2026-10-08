// The class A write for certificates: authoring a design. Pointing an event at
// one is part of the event's configuration (`write_event_config`). Bounded to
// named rows, reversible, and nothing leaves the platform.
//
// There is deliberately no delete. `config_diploma_templates` returns template
// ids, so a delete tool would be something a model could aim on its own, which
// puts it in class C. A certificate is retired by leaving it unreferenced, and
// the FK is `Restrict` so a hand-deletion of one still in use fails loudly.
import { prisma } from '$lib/server/db';
import {
  COHORT_TAIL_PAGES,
  unknownCertificateTokens,
} from '$lib/domain/diplomas';
import { sanitizeCertificateDesign } from '$lib/server/diplomaSanitize';
import { renderCertificateSample } from '$lib/server/services/diplomaGenerator';
import { diplomaTemplatePreviewLink } from '$lib/server/diplomaTemplates';
import { OperationRefusedError } from '../errors';
import { metric } from '../metrics';
import { canonicalJson, type WriteOutcome } from '../plan';

/**
 * What a certificate write records on its audit row, before and after.
 *
 * The full design, not a digest: it is the artifact, it carries no personal data,
 * and a bad edit is only recoverable if the previous text is in the audit row.
 * `POST /api/jobs/gc-api-audit` bounds how long that is kept. It is not what the
 * caller is told: see the `answer` at the end of `writeDiplomaTemplate`.
 */
type DiplomaTemplateState = {
  code: string;
  label: string;
  styleCss: string;
  bodyHtml: string;
  pageWidthPx: number;
  pageHeightPx: number;
};

const STATE_SELECT = {
  code: true,
  label: true,
  styleCss: true,
  bodyHtml: true,
  pageWidthPx: true,
  pageHeightPx: true,
} as const;

export async function writeDiplomaTemplate(params: {
  code: string;
  label: string;
  styleCss: string;
  bodyHtml: string;
  pageWidthPx?: number;
  pageHeightPx?: number;
  /** Origin of the request being answered, for the preview link. */
  origin: string;
}): Promise<WriteOutcome> {
  const code = params.code.trim();
  const label = params.label.trim();
  if (!code || !label) {
    throw new OperationRefusedError(
      "Un certificat a besoin d'un code technique et d'un libellé français (celui que voient les équipes et qui nomme le fichier téléchargé).",
    );
  }

  const before: DiplomaTemplateState | null =
    await prisma.diploma_Template.findUnique({
      where: { code },
      select: STATE_SELECT,
    });

  // A misspelled placeholder would print as `{dateDbut}` on paper, so it is a
  // refusal rather than something the render silently carries through.
  const unknown = [
    ...new Set([
      ...unknownCertificateTokens(params.bodyHtml),
      ...unknownCertificateTokens(params.styleCss),
    ]),
  ];
  if (unknown.length > 0) {
    throw new OperationRefusedError(
      `Repères inconnus dans le certificat : ${unknown.map((t) => `{${t}}`).join(', ')}. L'opération config_diploma_templates liste les repères disponibles et ce que chacun remplace.`,
    );
  }

  // The refusal is what the sanitiser had to remove, so what gets stored is
  // what was written: a design either passes intact or is not stored at all.
  const screened = sanitizeCertificateDesign({
    styleCss: params.styleCss,
    bodyHtml: params.bodyHtml,
  });
  if (screened.problems.length > 0) {
    throw new OperationRefusedError(screened.problems.join(' '));
  }

  const design = {
    ...screened.design,
    pageWidthPx: params.pageWidthPx ?? before?.pageWidthPx ?? 1123,
    pageHeightPx: params.pageHeightPx ?? before?.pageHeightPx ?? 794,
  };

  // Last gate before storing: a design that makes the renderer fail or run away
  // is refused here rather than discovered in front of a whole cohort.
  let sample: Awaited<ReturnType<typeof renderCertificateSample>>;
  try {
    sample = await renderCertificateSample(design);
  } catch (err) {
    throw new OperationRefusedError(
      `Ce certificat ne se rend pas : ${err instanceof Error ? err.message : String(err)}. Rien n'a été enregistré.`,
    );
  }

  const after: DiplomaTemplateState = await prisma.diploma_Template.upsert({
    where: { code },
    create: { code, label, ...design },
    update: { label, ...design },
    select: STATE_SELECT,
  });

  return {
    applied: true,
    before,
    after,
    // A receipt, not the design: the caller has just sent the design, and
    // `config_diploma_templates` returns it to whoever needs it again. What the
    // caller cannot know is whether anything changed and what it looks like now,
    // so it gets that, and the preview link it would otherwise ask for next.
    answer: {
      created: before === null,
      changed: canonicalJson(before) !== canonicalJson(after),
      certificate: {
        code: after.code,
        label: after.label,
        pageWidthPx: after.pageWidthPx,
        pageHeightPx: after.pageHeightPx,
      },
      weight: metric(
        {
          perPageKb: Math.round(sample.bytesPerPage / 1024),
          // One decimal: 0.4 Mo and 68 Mo are both worth reading as they are.
          cohortMb:
            Math.round(
              ((sample.bytesPerPage * COHORT_TAIL_PAGES) / 1024 / 1024) * 10,
            ) / 10,
        },
        `Ce que chaque inscrit ajoute au PDF exporté (perPageKb, en Ko) et le poids du fichier pour une cohorte de ${COHORT_TAIL_PAGES} inscrits (cohortMb, en Mo), mesurés sur un rendu d'exemple. Texte, formes, dégradés et SVG pèsent quelques Ko par page. Un effet que l'impression convertit en image (flou, filtre, ombre floue) est redessiné à chaque page et peut en peser plusieurs centaines : un halo dessiné par un radial-gradient qui s'estompe vers le transparent rend presque pareil pour presque rien. C'est une indication, aucun poids n'est refusé.`,
      ),
      apercu: diplomaTemplatePreviewLink({
        code: after.code,
        label: after.label,
        origin: params.origin,
      }).apercu,
    },
  };
}
