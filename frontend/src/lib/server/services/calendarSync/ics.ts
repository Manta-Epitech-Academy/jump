/**
 * Hand-rolled RFC 5545 iCalendar emitter. Used by:
 *   - The `/calendar.ics` download endpoint (`METHOD:PUBLISH`)
 *   - The email-mode reconciler (`METHOD:REQUEST` / `METHOD:CANCEL`)
 *
 * Kept dependency-free (Outlook / Apple Mail / Gmail all parse the
 * minimal subset we emit) so the only "library" we trust is the spec.
 */

import type { Interview, Talent } from '@prisma/client';
import { INTERVIEW_SLOT_MINUTES } from '$lib/domain/interview';

export type IcsMethod = 'PUBLISH' | 'REQUEST' | 'CANCEL';

export type IcsAttendee = {
  email: string;
  name?: string;
  /** Default `REQ-PARTICIPANT`. */
  role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT';
};

export type IcsEventInput = {
  interview: Interview & { talent: Talent };
  /** Stable iCalendar UID. Should be `<interview.id>@jump.epitech.eu`. */
  uid: string;
  /** RFC 5545 SEQUENCE — bump on update to make Outlook merge. */
  sequence: number;
  organizer?: { email: string; name?: string };
  attendees?: IcsAttendee[];
  /** Set true to flip STATUS:CANCELLED. Use with `METHOD:CANCEL`. */
  cancelled?: boolean;
};

export function buildIcsCalendar(args: {
  method: IcsMethod;
  prodId?: string;
  events: IcsEventInput[];
  /** Optional X-WR-* header overrides (Outlook ignores, Google honors). */
  calendarName?: string;
}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${args.prodId ?? '-//Jump//Entretiens//FR'}`,
    'CALSCALE:GREGORIAN',
    `METHOD:${args.method}`,
  ];
  if (args.calendarName)
    lines.push(`X-WR-CALNAME:${escape(args.calendarName)}`);
  for (const ev of args.events) lines.push(...buildVevent(ev));
  lines.push('END:VCALENDAR');
  // RFC 5545 §3.1: each content line ≤75 octets, fold long lines onto
  // continuation lines that start with one whitespace octet. CRLF
  // separates every line, including the trailing one.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function buildVevent(input: IcsEventInput): string[] {
  const { interview, uid, sequence, cancelled } = input;
  const start = interview.date;
  const end = new Date(start.getTime() + INTERVIEW_SLOT_MINUTES * 60_000);
  const stamp = new Date();

  const description = buildDescription(interview);
  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${formatUtc(stamp)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escape(`Entretien — ${interview.talent.prenom} ${interview.talent.nom}`)}`,
    `DESCRIPTION:${escape(description)}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
  ];
  if (input.organizer) {
    const display = input.organizer.name
      ? `;CN=${escape(input.organizer.name)}`
      : '';
    lines.push(`ORGANIZER${display}:mailto:${input.organizer.email}`);
  }
  for (const a of input.attendees ?? []) {
    const cn = a.name ? `;CN=${escape(a.name)}` : '';
    const role = a.role ?? 'REQ-PARTICIPANT';
    lines.push(
      `ATTENDEE;ROLE=${role};PARTSTAT=NEEDS-ACTION;RSVP=TRUE${cn}:mailto:${a.email}`,
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

function buildDescription(interview: Interview & { talent: Talent }): string {
  const parts = [
    `Statut : ${interview.status}`,
    interview.talent.phone ? `Tél : ${interview.talent.phone}` : null,
    interview.talent.parentPhone
      ? `Tél parent : ${interview.talent.parentPhone}`
      : null,
    interview.talent.email ? `Email : ${interview.talent.email}` : null,
    interview.globalNote ? `\nNotes : ${interview.globalNote}` : null,
  ].filter((p): p is string => Boolean(p));
  return parts.join('\n');
}

export function formatUtc(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/**
 * Escape RFC 5545 special characters: backslash, comma, semicolon, newline.
 *
 * Order matters: we double backslashes first so we never re-escape backslashes
 * we inject ourselves, then collapse `\r\n` / lone `\r` to a literal `\n`
 * sequence — bare CR mid-line would otherwise truncate the property value at
 * any parser that treats CR as a line terminator (RFC 5545 line endings are
 * CRLF). Pasting from Windows mail clients regularly drags CRs into the
 * `globalNote` textarea, so this isn't purely theoretical.
 */
export function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * RFC 5545 §3.1 line folding. Each emitted line stays ≤75 octets;
 * overflow becomes continuation lines prefixed by a single space.
 * Continuation lines max payload is 74 octets (75 minus the leading
 * space). UTF-8 boundary safe — never splits a multi-byte codepoint.
 *
 * Operates on the byte representation, not characters, because the
 * 75-octet limit is measured in bytes per the spec.
 */
export function foldLine(line: string): string {
  const bytes = TEXT_ENCODER.encode(line);
  if (bytes.length <= 75) return line;

  const segments: string[] = [];
  let cursor = 0;
  // First segment can use the full 75 octets; continuations lose 1 to
  // the leading whitespace. We track the running budget per iteration.
  let budget = 75;
  while (cursor < bytes.length) {
    let end = Math.min(cursor + budget, bytes.length);
    if (end < bytes.length) {
      // Walk back to a UTF-8 lead byte so we don't split a multi-byte
      // sequence. Continuation bytes have the form 10xxxxxx (0x80..0xBF).
      while (end > cursor && (bytes[end] & 0xc0) === 0x80) end--;
    }
    segments.push(TEXT_DECODER.decode(bytes.subarray(cursor, end)));
    cursor = end;
    budget = 74;
  }
  return segments.join('\r\n ');
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export function uidFor(interviewId: string): string {
  return `${interviewId}@jump.epitech.eu`;
}

/** Stable hash over the fields that, when changed, should re-emit a
 *  `METHOD:REQUEST` invite (or PATCH a Graph event). Skip when equal. */
export function hashInterviewBody(
  interview: Interview & { talent: Talent },
): string {
  const blob = JSON.stringify([
    interview.date.toISOString(),
    interview.status,
    interview.talent.prenom,
    interview.talent.nom,
    interview.talent.phone ?? '',
    interview.talent.parentPhone ?? '',
    interview.talent.email ?? '',
    interview.globalNote ?? '',
  ]);
  return cyrb53(blob).toString(16);
}

// Tiny non-cryptographic 53-bit hash. Stable across runs; good enough for
// "did anything in the email body change?" comparisons. Avoids dragging
// node:crypto in for a content fingerprint.
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
