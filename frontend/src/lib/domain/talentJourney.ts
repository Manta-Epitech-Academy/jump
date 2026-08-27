import type { ClosingRecommendation } from '@prisma/client';

/**
 * A talent's path with us, for the dev fiche: every past event, in order, with
 * what happened at it.
 *
 * Same shape as the XP "story" beside it - a pure domain type plus a server
 * builder (`services/talentJourneyService.ts`) - and for the same reason. The
 * fiche is read to learn who somebody is, not to audit rows, so the assembling
 * happens once on the server and the component paints what it is given.
 *
 * It replaces a bare event log. A regular attends eight to ten events a year and
 * gets a closing at each, so the list already existed; what it lacked was what
 * the person said and how the team read them, which is the part that answers
 * "who am I about to sit down with".
 */

/** One event this talent attended, and what came of it. */
export type TalentJourneyEntry = {
  /** The participation, which is what a closing hangs off and what the conduct
   *  route is addressed by. */
  participationId: string;
  eventId: string;
  eventName: string;
  /** Pre-formatted French date in the campus timezone, e.g. "16 juin 2026". */
  dateLabel: string;
  /** Salesforce's read on whether they turned up. Null when it says nothing. */
  presence: 'present' | 'absent' | null;
  /** The closing conducted at that event, if the event holds closings at all. */
  closing: TalentJourneyClosing | null;
};

export type TalentJourneyClosing = {
  status: 'in_progress' | 'done';
  /** The team's verdict, once given. */
  recommendation: ClosingRecommendation | null;
  /** The team's own words about the talent. Rendered plainly, never as a
   *  quotation: the quote treatment on this page belongs to the talent's voice. */
  verdictNote: string | null;
  /** The talent's own sentence about the event, where the grid asked for one. */
  quote: string | null;
  /**
   * Who conducted it, name and avatar. Carried so the two kinds of writing in a
   * closing can be ATTRIBUTED rather than only styled: the reader was left to
   * infer from a rule colour that one sentence was the student's and the next
   * one the team's, and that inference is exactly what nobody made.
   *
   * The avatar is not decoration: staff prose about a talent is signed with a
   * face everywhere else on this page (`TalentNoteCard`) and on the closing's own
   * page, so signing it with a glyph here made the same person read as two
   * different kinds of thing on one screen.
   */
  staffName: string | null;
  staffImage: string | null;
};

export type TalentJourney = {
  entries: TalentJourneyEntry[];
  /** Events attended, which is what the section's header counts. */
  eventCount: number;
  /** Closings finalised, the other half of that count. */
  closingCount: number;
};

/** Whether anything on the journey is worth rendering. */
export function hasJourney(journey: TalentJourney): boolean {
  return journey.entries.length > 0;
}
