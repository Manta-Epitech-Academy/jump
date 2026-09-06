// The class A writes for certificates: authoring a design, and pointing an event
// at one. Bounded to named rows, reversible, and nothing leaves the platform.
//
// There is deliberately no delete. `config_diploma_templates` returns template
// ids, so a delete tool would be something a model could aim on its own, which
// puts it in class C. A certificate is retired by leaving it unreferenced, and
// the FK is `Restrict` so a hand-deletion of one still in use fails loudly.
import { prisma } from '$lib/server/db';
import { unknownCertificateTokens } from '$lib/domain/diplomas';
import {
  certificateProblems,
  sanitizeCertificateCss,
  sanitizeCertificateHtml,
} from '$lib/server/diplomaSanitize';
import { renderCertificateSample } from '$lib/server/services/diplomaGenerator';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import { UnknownScopeError } from '../scope';
import type { WriteOutcome } from '../plan';

/**
 * What a certificate write reports, before and after.
 *
 * The full design, not a digest: it is the artifact, it carries no personal data,
 * and a bad edit is only recoverable if the previous text is in the audit row.
 * `POST /api/jobs/gc-api-audit` bounds how long that is kept.
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
}): Promise<WriteOutcome> {
  const code = params.code.trim();
  const label = params.label.trim();
  if (!code || !label) {
    throw new OperationRefusedError(
      "Un certificat a besoin d'un code technique et d'un libellé français (celui que voient les équipes et qui nomme le fichier téléchargé).",
    );
  }

  const before = await prisma.diploma_Template.findUnique({
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

  const problems = certificateProblems({
    styleCss: params.styleCss,
    bodyHtml: params.bodyHtml,
  });
  if (problems.length > 0) throw new OperationRefusedError(problems.join(' '));

  // Sanitised even though the checks above passed: what gets stored is what a
  // browser will execute, and that should not depend on a scanner being complete.
  const design = {
    styleCss: sanitizeCertificateCss(params.styleCss),
    bodyHtml: sanitizeCertificateHtml(params.bodyHtml),
    pageWidthPx: params.pageWidthPx ?? before?.pageWidthPx ?? 1123,
    pageHeightPx: params.pageHeightPx ?? before?.pageHeightPx ?? 794,
  };

  // Last gate before storing: a design that makes the renderer fail or run away
  // is refused here rather than discovered in front of a whole cohort.
  try {
    await renderCertificateSample(design);
  } catch (err) {
    throw new OperationRefusedError(
      `Ce certificat ne se rend pas : ${err instanceof Error ? err.message : String(err)}. Rien n'a été enregistré.`,
    );
  }

  const after = await prisma.diploma_Template.upsert({
    where: { code },
    create: { code, label, ...design },
    update: { label, ...design },
    select: STATE_SELECT,
  });

  return { applied: true, before, after };
}

/** What every event-scoped certificate write reports. */
type EventCertificateState = {
  eventId: string;
  certificate: { code: string; label: string } | null;
};

async function eventCertificateState(
  eventId: string,
): Promise<EventCertificateState> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      diplomaTemplate: { select: { code: true, label: true } },
    },
  });
  if (!event) {
    throw new UnknownScopeError(
      `Événement « ${eventId} » introuvable. ${handleProvenanceFr('eventId')}`,
    );
  }
  return { eventId: event.id, certificate: event.diplomaTemplate };
}

export async function writeEventDiplomaTemplate(params: {
  eventId: string;
  templateId?: string;
}): Promise<WriteOutcome> {
  const before = await eventCertificateState(params.eventId);

  // A blank id is "issues none", never a row to go looking for. The catalogue's
  // schema refuses an empty string upstream; normalising here is what makes that
  // a second line of defence rather than the only one, because `?? null` on a
  // string that might be empty puts `''` in an FK column and answers a caller's
  // own mistake with "erreur interne".
  const templateId = params.templateId?.trim() || null;

  if (templateId) {
    const exists = await prisma.diploma_Template.findUnique({
      where: { id: templateId },
      select: { id: true },
    });
    if (!exists) {
      throw new OperationRefusedError(
        `Certificat « ${templateId} » introuvable. ${handleProvenanceFr('diplomaTemplateId')}`,
      );
    }
  }

  await prisma.event.update({
    where: { id: params.eventId },
    data: { diplomaTemplateId: templateId },
  });

  return {
    applied: true,
    before,
    after: await eventCertificateState(params.eventId),
  };
}
