import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { prisma } from '$lib/server/db';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  availableProducers,
  EVENT_PRODUCER_DEFS,
  type EventProducerBase,
  type EventProducerKey,
  type EventSurfaceGates,
} from '$lib/domain/eventModules';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { resolvePublishedEventForm } from '$lib/server/feedbackForms';
import { buildSubmissionWhere } from '$lib/server/feedbackStats';

/**
 * Everything this event lets you produce and take away, in one place.
 *
 * The page renders `availableProducers`, and the sidebar entry is gated on the
 * same call, so a nav entry that opens an empty page is not possible. It still
 * 404s on an empty list of its own, the way the planning page double-enforces
 * its own gate: hiding an entry is not the same as refusing a hand-typed URL.
 */

/** Which producers each count feeds, so nothing uncounted is queried. */
const BASES_OF = (keys: EventProducerKey[]): Set<EventProducerBase> =>
  new Set(keys.map((key) => EVENT_PRODUCER_DEFS[key].base));

export const load: PageServerLoad = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  // The feedback form is resolved through the same helper the bilan surface and
  // its export use, not off the raw `feedbackFormId`: a form unpublished after
  // it was picked resolves to none there, so reading the FK here would offer a
  // download that 404s.
  const form = await resolvePublishedEventForm(event);

  const gates: EventSurfaceGates = {
    modules: event.modules,
    // Not a producer gate. Planning is read-only pedago data and produces no
    // file, so this surface never asks about it.
    hasPlanning: false,
    hasFeedbackForm: form !== null,
    hasClosingTemplate: event.closingTemplateId !== null,
    hasDiplomaTemplate: event.diplomaTemplateId !== null,
  };

  const producers = availableProducers(gates);
  if (producers.length === 0) {
    throw error(404, 'Cet événement ne produit aucun document ni export.');
  }

  // One count per base actually needed, so an event with only badges does not
  // pay for a closings query. Each says what the button is about to act on, and
  // a zero disables it rather than leaving it dead.
  const bases = BASES_OF(producers);
  const [roster, closingsDone, submissions] = await Promise.all([
    bases.has('roster')
      ? db.participation.count({
          where: { eventId: event.id, ...visibleParticipationWhere },
        })
      : Promise.resolve(0),
    bases.has('closingsDone')
      ? db.closing_Record.count({
          where: { eventId: event.id, status: 'done' },
        })
      : Promise.resolve(0),
    // Submissions are not campus-scoped rows; the campus check is the event
    // lookup above, which is how the bilan export reads them too.
    bases.has('submissions') && form
      ? prisma.feedback_Submission.count({
          where: buildSubmissionWhere(form.id, { eventId: event.id }),
        })
      : Promise.resolve(0),
  ]);

  return {
    event,
    producers,
    counts: { roster, closingsDone, submissions } satisfies Record<
      EventProducerBase,
      number
    >,
  };
};
