/**
 * Renders the weekly admin digest, HTML part and text part, from one
 * description of it.
 *
 * The two parts used to be written by hand side by side, and they had drifted:
 * the text part printed a zero for a queue the HTML left out, and worded the
 * held prunes and the unknown Salesforce statuses differently. Here the copy is
 * written once, as segments, and each renderer only decides how a segment
 * looks. Escaping happens in one place, the HTML renderer, so copy is written
 * plain and never pre-escaped.
 *
 * Pure: no database, no clock, no environment. Links are paths; `baseUrl` turns
 * them absolute here, the way a recipient's mail client needs them.
 */

import {
  EPI_BLUE,
  INK,
  SUBTLE,
  BORDER,
  PANEL_BG,
  shellOpen,
  shellClose,
  wrapEmailDocument,
} from '$lib/domain/emailBrandShell';
import { escapeHtml } from '$lib/domain/htmlEscape';

/** A run of copy: plain, emphasised, or a link to the page that acts on it. */
export type Segment =
  string | { strong: string } | { link: { href: string; label: string } };

/**
 * One block of a section. Consecutive `item`s render as one bulleted list, so a
 * finding that is one line is an `item` and a section of several reads as a
 * list without the finding knowing its neighbours.
 */
export type DigestBlock =
  | { kind: 'paragraph'; segments: Segment[] }
  | { kind: 'item'; segments: Segment[] }
  | { kind: 'note'; segments: Segment[] }
  | { kind: 'table'; head: string[]; rows: Segment[][][] };

export type DigestSectionView = { title: string; blocks: DigestBlock[] };

/** Everything the mail says, in the order it says it. */
export type DigestDocument = {
  subject: string;
  title: string;
  intro: string;
  sections: DigestSectionView[];
  footer: string;
};

const absolute = (baseUrl: string, href: string) =>
  /^https?:\/\//.test(href) ? href : `${baseUrl}${href}`;

function segmentHtml(segment: Segment, baseUrl: string): string {
  if (typeof segment === 'string') return escapeHtml(segment);
  if ('strong' in segment)
    return `<strong>${escapeHtml(segment.strong)}</strong>`;
  const { href, label } = segment.link;
  return `<a href="${escapeHtml(absolute(baseUrl, href))}" style="color:${EPI_BLUE};text-decoration:underline;">${escapeHtml(label)}</a>`;
}

function segmentText(segment: Segment, baseUrl: string): string {
  if (typeof segment === 'string') return segment;
  if ('strong' in segment) return segment.strong;
  return `${segment.link.label} (${absolute(baseUrl, segment.link.href)})`;
}

const html = (segments: Segment[], baseUrl: string) =>
  segments.map((s) => segmentHtml(s, baseUrl)).join('');

const text = (segments: Segment[], baseUrl: string) =>
  segments.map((s) => segmentText(s, baseUrl)).join('');

const CELL = `padding:6px 10px;border-bottom:1px solid ${BORDER};`;

function tableHtml(
  block: Extract<DigestBlock, { kind: 'table' }>,
  baseUrl: string,
): string {
  const head = block.head
    .map((h) => `<th style="padding:6px 10px;">${escapeHtml(h)}</th>`)
    .join('');
  const rows = block.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td style="${CELL}">${html(cell, baseUrl)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:0 0 8px;"><thead><tr style="text-align:left;background:${PANEL_BG};">${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function blocksHtml(blocks: DigestBlock[], baseUrl: string): string {
  const out: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length)
      out.push(
        `<ul style="margin:0 0 16px;padding-left:18px;">${items.join('')}</ul>`,
      );
    items = [];
  };
  for (const block of blocks) {
    if (block.kind === 'item') {
      items.push(`<li>${html(block.segments, baseUrl)}</li>`);
      continue;
    }
    flush();
    if (block.kind === 'paragraph')
      out.push(
        `<p style="margin:0 0 12px;">${html(block.segments, baseUrl)}</p>`,
      );
    else if (block.kind === 'note')
      out.push(
        `<p style="margin:0 0 16px;font-size:13px;color:${SUBTLE};">${html(block.segments, baseUrl)}</p>`,
      );
    else out.push(tableHtml(block, baseUrl));
  }
  flush();
  return out.join('');
}

function blocksText(blocks: DigestBlock[], baseUrl: string): string[] {
  return blocks.flatMap((block) => {
    if (block.kind === 'item') return [`- ${text(block.segments, baseUrl)}`];
    if (block.kind === 'table')
      return block.rows.map(
        (row) => `- ${row.map((cell) => text(cell, baseUrl)).join(' · ')}`,
      );
    return [text(block.segments, baseUrl)];
  });
}

/** The HTML part, wrapped in the branded shell as a full document. */
export function renderDigestHtml(doc: DigestDocument, baseUrl: string): string {
  const h2 = `font-size:15px;font-weight:700;margin:0 0 8px;color:${INK};`;
  const body = [
    `<h1 style="font-size:20px;font-weight:700;margin:0 0 4px;color:${INK};">${escapeHtml(doc.title)}</h1>`,
    `<p style="margin:0 0 20px;color:${SUBTLE};font-size:13px;">${escapeHtml(doc.intro)}</p>`,
    ...doc.sections.map(
      (section) =>
        `<h2 style="${h2}">${escapeHtml(section.title)}</h2>${blocksHtml(section.blocks, baseUrl)}`,
    ),
    `<p style="margin:24px 0 0;color:${SUBTLE};font-size:12px;">${escapeHtml(doc.footer)}</p>`,
  ].join('');
  return wrapEmailDocument(
    `${shellOpen(baseUrl)}${body}${shellClose()}`,
    doc.subject,
  );
}

/** The text part: the same blocks, one line each. */
export function renderDigestText(doc: DigestDocument, baseUrl: string): string {
  return [
    doc.title,
    doc.intro,
    ...doc.sections.flatMap((section) => [
      '',
      section.title.toUpperCase(),
      ...blocksText(section.blocks, baseUrl),
    ]),
    '',
    doc.footer,
  ].join('\n');
}
