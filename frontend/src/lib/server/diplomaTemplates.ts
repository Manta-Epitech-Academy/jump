import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { renderCertificatePreviewPng } from '$lib/server/services/diplomaGenerator';
import { UnknownScopeError } from '$lib/server/adminApi/scope';

/**
 * Which certificate an event issues, resolved from the one explicit FK on the
 * event. Mirrors `feedbackForms.ts`: one private `where` builder, then a narrow
 * and a full resolver over it, so the page and the render can never disagree
 * about which document an event delivers.
 *
 * There is no fallback. An event with no `diplomaTemplateId` issues nothing, and
 * that is the gate the Inscrits export reads.
 */

/** Minimal event shape the resolvers read. */
export type EventDiplomaRef = {
  diplomaTemplateId: string | null;
};

function eventTemplateWhere(
  event: EventDiplomaRef,
): Prisma.Diploma_TemplateWhereUniqueInput | null {
  return event.diplomaTemplateId ? { id: event.diplomaTemplateId } : null;
}

/** What names the document: the picker's label and the download filename. */
const IDENTITY_SELECT = {
  id: true,
  code: true,
  label: true,
} as const satisfies Prisma.Diploma_TemplateSelect;

export type DiplomaTemplateIdentity = Prisma.Diploma_TemplateGetPayload<{
  select: typeof IDENTITY_SELECT;
}>;

/** What the renderer needs: the identity, plus the design itself. */
const DESIGN_SELECT = {
  ...IDENTITY_SELECT,
  styleCss: true,
  bodyHtml: true,
  pageWidthPx: true,
  pageHeightPx: true,
} as const satisfies Prisma.Diploma_TemplateSelect;

export type DiplomaTemplateDesign = Prisma.Diploma_TemplateGetPayload<{
  select: typeof DESIGN_SELECT;
}>;

/**
 * Just enough to name the document, for a page that only decides whether to
 * offer the export and what to call the file. Deliberately does not load the
 * design: that is kilobytes of CSS a list page has no use for.
 */
export function resolveEventDiplomaIdentity(
  event: EventDiplomaRef,
): Promise<DiplomaTemplateIdentity | null> {
  const where = eventTemplateWhere(event);
  if (!where) return Promise.resolve(null);
  return prisma.diploma_Template.findUnique({ where, select: IDENTITY_SELECT });
}

/** The full design, for the render itself. */
export function resolveEventDiplomaDesign(
  event: EventDiplomaRef,
): Promise<DiplomaTemplateDesign | null> {
  const where = eventTemplateWhere(event);
  if (!where) return Promise.resolve(null);
  return prisma.diploma_Template.findUnique({ where, select: DESIGN_SELECT });
}

/**
 * The catalogue, for the event-config picker and the curated API.
 * Ordered by label so the dropdown reads alphabetically.
 */
export function listDiplomaTemplates(): Promise<DiplomaTemplateIdentity[]> {
  return prisma.diploma_Template.findMany({
    select: IDENTITY_SELECT,
    orderBy: { label: 'asc' },
  });
}

/**
 * What one certificate actually looks like: its first page, rendered.
 *
 * The answer to a question the design alone cannot answer, because `styleCss` and
 * `bodyHtml` do not contain the shell that surrounds them. Asked without this, a
 * model reconstructs a lookalike from the source and presents it as the document.
 *
 * Rendered with placeholder names, never a cohort, so a preview can never carry a
 * student's identity into a chat. The `note` says so in the answer, because an
 * image of a certificate with a name on it invites exactly the wrong caption.
 *
 * The answer carries the image twice over, and not by oversight: `image` for a
 * consumer that can display one, `url` for one that cannot. Which of the two a
 * caller is, nobody can tell: MCP has no capability for "renders images", and a
 * model that returned an image block believes it showed something. So the link is
 * handed over unconditionally, inside `apercu`, as a finished sentence to quote.
 *
 * That is not decoration. Watched twice: asked what a certificate looks like, a
 * model with the image in hand answered "Voilà" plus a description it invented
 * ("dark thème, style tech/radar"), and the reader saw nothing at all. Composing
 * the sentence here is the same fix as shipping a definition with every figure.
 */
export async function getDiplomaTemplatePreview(params: {
  code: string;
}): Promise<{
  code: string;
  label: string;
  image: { mimeType: string; base64: string };
  url: string;
  widthPx: number;
  heightPx: number;
  apercu: string;
}> {
  const template = await prisma.diploma_Template.findUnique({
    where: { code: params.code },
    select: DESIGN_SELECT,
  });
  if (!template) {
    const known = await prisma.diploma_Template.findMany({
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    throw new UnknownScopeError(
      `Certificat « ${params.code} » introuvable. Les codes existants sont : ${known.map((t) => t.code).join(', ')}.`,
    );
  }

  const { png, widthPx, heightPx } =
    await renderCertificatePreviewPng(template);

  const url = `${env.ORIGIN ?? ''}${base}/api/admin/config/diploma-template-preview?code=${encodeURIComponent(template.code)}`;

  return {
    code: template.code,
    label: template.label,
    image: {
      mimeType: 'image/png',
      base64: Buffer.from(png).toString('base64'),
    },
    url,
    widthPx,
    heightPx,
    // A sentence to quote, not facts to compose one from. Same move as
    // `metric(value, definition)`, and for a sharper reason here: a model cannot
    // tell whether its client renders an inline image, so "show the image, or
    // else give the link" is a condition it has no way to evaluate. It returned
    // an image, so from its side it did show something, and the reader saw
    // nothing. Handing over the link is therefore unconditional, and the wording
    // is ours so it survives being relayed verbatim.
    apercu: `Aperçu de « ${template.label} » : ${url} (nom, dates, ville et signataire sont des exemples, aucune donnée de jeune n'y figure). Ouvrez ce lien pour voir le certificat.`,
  };
}
