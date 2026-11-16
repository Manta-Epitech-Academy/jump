import { dateKeyParts, type DateKey } from './eventPresence';

// The calendar file behind the hero's « Ajouter à mon agenda » (#501): one
// event a talent is enrolled in, as an iCalendar (RFC 5545) the phone's own
// calendar opens, with no outside service in between (AC4). Hand-written
// because the subset is tiny and every calendar parses it; an interview
// emitter of the same kind lived in `calendarSync/ics.ts` until its feature
// went (09019568).
//
// The event is written as whole days, from its first day to its last: Jump
// knows when a talent is expected (the arrival time) but not when a day ends,
// so a timed block would state an end nobody chose. The arrival time goes in
// the description instead.

export type IcsEvent = {
  id: string;
  name: string;
  /** First and last campus day; `endDate` null for one day. */
  date: DateKey;
  endDate: DateKey | null;
  location: string;
  /** « Accueil à 10h00 », or null when the event has no arrival time. */
  description: string | null;
};

/** One VCALENDAR holding the one event. `now` stamps it (DTSTAMP). */
export function buildEventIcs(event: IcsEvent, now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Epitech Academy//Jump//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable, so adding the same event twice updates it rather than doubling it.
    `UID:event-${event.id}@jump`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${compactDay(event.date)}`,
    // DTEND of an all-day event is exclusive: the day after the last one.
    `DTEND;VALUE=DATE:${compactDay(dayAfter(event.endDate ?? event.date))}`,
    `SUMMARY:${escapeText(event.name)}`,
    `LOCATION:${escapeText(event.location)}`,
    ...(event.description
      ? [`DESCRIPTION:${escapeText(event.description)}`]
      : []),
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** « 20261027 », the VALUE=DATE form of a day key. */
function compactDay(key: DateKey): string {
  return key.replaceAll('-', '');
}

function dayAfter(key: DateKey): DateKey {
  const { year, month, day } = dateKeyParts(key);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

/** « 20261116T081500Z ». */
function utcStamp(at: Date): string {
  return at
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll('-', '')
    .replaceAll(':', '');
}

/**
 * RFC 5545 §3.3.11 TEXT: backslash first, so the escapes added after it are
 * not escaped again, then line breaks (a bare CR would end the property at a
 * parser reading CR as a line end), commas and semicolons.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/**
 * RFC 5545 §3.1: a content line holds at most 75 octets, the rest continues on
 * lines opening with one space. Counted in UTF-8 bytes, as the spec counts
 * them, and never inside a character: an event name is French, so accents are
 * two bytes each.
 */
export function foldLine(line: string): string {
  const bytes = ENCODER.encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off a UTF-8 continuation byte (10xxxxxx) so no character is cut.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(DECODER.decode(bytes.slice(start, end)));
    start = end;
    limit = 74; // the leading space takes one octet of every continuation
  }
  return parts.join('\r\n ');
}
