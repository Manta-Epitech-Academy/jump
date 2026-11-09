/**
 * « Venu » : whether a talent came to an event, the one notion every dev screen
 * reads when it says « Déjà venu 3 fois » or « Nouveau » (#491).
 *
 * A talent came to an event once the event is over and something attests it:
 *   - a Salesforce status the event counts as attended
 *     (`EventConfig_ShownStatus.attestsAttendance`: MET on a Coding Club,
 *     « 4 - En stage » on a stage), set by the PO over the admin API;
 *   - a half-day émargé present or late;
 *   - a closing conducted there;
 *   - an activity entered there.
 *
 * One proof is enough, and no absence is ever inferred from a missing one: most
 * past events were never émargé, and an unmarked talent is not an absent one.
 *
 * The proofs are projected onto `Participation.attendanceAttested` by
 * `services/attendance.ts`, with the statement below. « Over » is not in the
 * projection, because no write happens when an event ends: it is applied here,
 * on read. It is also what lets the PO count « 3 - Convention validée » as
 * attended on a stage, which only means it once the stage has run.
 *
 * Kept free of `$lib` imports: the seed generator imports it under plain Bun to
 * check its own rows against the very statement the application runs.
 */

import type { Prisma } from '@prisma/client';
import { visibleParticipationWhere } from './sfMemberStatus';

/**
 * Whether a proof of attendance exists for the participation `p`, as one SQL
 * boolean expression over the four tables that can hold one. The one statement
 * of the rule: `recomputeAttendance` sets the projection with it and the seed's
 * projection check compares against it.
 */
export const ATTENDANCE_PROOF_SQL = `(
  EXISTS (
    SELECT 1 FROM "EventConfig_ShownStatus" s
    WHERE s."eventId" = p."eventId"
      AND s."status" = p."sfMemberStatus"
      AND s."attestsAttendance"
  )
  OR EXISTS (
    SELECT 1 FROM "EventPresence" e
    WHERE e."eventId" = p."eventId"
      AND e."talentId" = p."talentId"
      AND e."status" IN ('present', 'late')
  )
  OR EXISTS (
    SELECT 1 FROM "Closing_Record" c
    WHERE c."eventId" = p."eventId" AND c."talentId" = p."talentId"
  )
  OR EXISTS (
    SELECT 1 FROM "Workshop_Participation" w
    WHERE w."eventId" = p."eventId" AND w."talentId" = p."talentId"
  )
)`;

/**
 * How long a day without an end day lasts: an event with no `endDate` is a
 * single-day event (`salesforce.md`), stored at 00:00 campus-local and over at
 * 23:59 of that day.
 */
const SINGLE_DAY_MS = 24 * 60 * 60 * 1000 - 60 * 1000;

/**
 * The enrolments of talents who came, on events over before `reference`.
 * Spread into a `Participation` where, like `visibleParticipationWhere`, which
 * it includes: a masked enrolment counts nowhere in the dev space.
 *
 * `reference` is the start of the event being looked at when counting a
 * talent's earlier visits (an event on the same day does not count), or now.
 */
export function attendedBeforeWhere(
  reference: Date,
): Prisma.ParticipationWhereInput {
  return {
    ...visibleParticipationWhere,
    attendanceAttested: true,
    event: {
      OR: [
        { endDate: { lt: reference } },
        {
          endDate: null,
          date: { lt: new Date(reference.getTime() - SINGLE_DAY_MS) },
        },
      ],
    },
  };
}

/**
 * What « venu » counts, in French, for the admin API's definitions. Reads as a
 * clause after a noun: "Talents ${ATTENDED_DEFINITION}."
 */
export const ATTENDED_DEFINITION =
  "venus à l'événement, une fois celui-ci terminé : leur statut Salesforce fait partie des statuts que l'événement compte comme une venue (réglés événement par événement), " +
  'ou ils ont été émargés présents ou en retard sur au moins une demi-journée, ou ils ont eu un closing, ou ils ont fait une activité de cet événement. ' +
  "Une seule preuve suffit, et l'absence de preuve ne signifie pas une absence";
