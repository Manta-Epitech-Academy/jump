import type { PageServerLoad, Actions, RequestEvent } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { NOTE_INCLUDE, serializeNote } from '$lib/server/talentNotes';
import { getTalentJourney } from '$lib/server/services/talentJourneyService';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import {
  LATEST_IMAGE_RIGHTS_DECISION_ORDER,
  recordImageRightsDecision,
} from '$lib/server/services/imageRightsService';
import { imageRightsCorrectionSchema } from '$lib/validation/imageRights';
import type { Communication } from '$lib/domain/communications';
import { getTalentXpStory } from '$lib/server/services/xpStoryService';
import {
  visibleParticipationWhere,
  pastEventPresence,
} from '$lib/domain/sfMemberStatus';
import { eventDisplayName } from '$lib/domain/event';
import { getLifecycleBounds, getEventStatus } from '$lib/domain/eventLifecycle';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// The scoped-down fiche keeps only the latest handful of communications, shown
// one-line each in the sticky right rail, no pagination. Volume per talent is
// in the low hundreds across a stage lifecycle, so fetch both sources unbounded,
// merge in memory, and slice the head.
const RIGHT_RAIL_COMMS = 6;

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);
  const broadcastsWhere = {
    OR: [{ talentId: params.id }, { parentOfTalentId: params.id }],
  };
  try {
    const [student, participations, broadcastRows, xpStory, noteRows] =
      await Promise.all([
        db.talent.findUniqueOrThrow({
          where: { id: params.id },
          include: {
            user: true,
            interests: { include: { interest: true } },
            school: { select: { name: true } },
            // Image-rights decision history (newest first) for the audit trail in
            // the rail: who decided what and when, parent vs staff correction.
            // Ordered on the decision instant first, so the head of this list is
            // the last thing a guardian actually decided - which is what the rail
            // resolves the publishing stance from.
            imageRightsRecords: {
              orderBy: LATEST_IMAGE_RIGHTS_DECISION_ORDER,
              include: {
                recordedBy: { select: { user: { select: { name: true } } } },
              },
            },
          },
        }),
        db.participation.findMany({
          where: { talentId: params.id, ...visibleParticipationWhere },
          select: {
            id: true,
            sfMemberStatus: true,
            event: {
              select: {
                id: true,
                titre: true,
                publicName: true,
                date: true,
                endDate: true,
                modules: { select: { moduleKey: true } },
              },
            },
          },
          orderBy: { event: { date: 'desc' } },
        }),
        prisma.broadcastRecipient.findMany({
          where: broadcastsWhere,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            sentAt: true,
            openedAt: true,
            parentOfTalentId: true,
            broadcast: {
              select: {
                id: true,
                name: true,
                channel: true,
                subjectSnapshot: true,
                createdAt: true,
                template: { select: { name: true } },
              },
            },
          },
        }),
        getTalentXpStory(params.id, timezone),
        // Staff notes feed (newest first). Visibility is already asserted by the
        // scoped `student` query above resolving for this campus.
        prisma.note_TalentNote.findMany({
          where: { talentId: params.id },
          orderBy: { createdAt: 'desc' },
          include: NOTE_INCLUDE,
        }),
      ]);

    const notes = noteRows.map(serializeNote);

    // `sentAt` is the canonical timestamp for the talent ("when did this land");
    // broadcasts fall back to the broadcast's createdAt when the recipient row
    // has not been stamped yet (queued/pending).
    const broadcastComms: Communication[] = broadcastRows.map((b) => ({
      kind: 'broadcast',
      id: b.id,
      sentAt: b.sentAt ?? b.broadcast.createdAt,
      audience: b.parentOfTalentId ? 'parent' : 'student',
      status: b.status as 'pending' | 'sent' | 'failed',
      openedAt: b.openedAt,
      channel: b.broadcast.channel as 'mail' | 'sms',
      broadcast: {
        id: b.broadcast.id,
        name: b.broadcast.name,
        subjectSnapshot: b.broadcast.subjectSnapshot,
        templateName: b.broadcast.template.name,
      },
    }));
    const allCommunications = [...broadcastComms].sort(
      (a, b) => b.sentAt.getTime() - a.sentAt.getTime(),
    );
    const communications = allCommunications.slice(0, RIGHT_RAIL_COMMS);

    // "Son parcours": the past events, newest first, each with the closing
    // conducted at it. Past-only, as the event history it replaces was: an event
    // still to come says nothing about who this person is yet. Assembled in its
    // own service so the fiche keeps painting rather than composing.
    const journey = await getTalentJourney(params.id, campusId, timezone);

    // Staff correction form for the image-rights decision, prefilled with the
    // current decision + the guardian on file (the last signer, else the parent
    // captured at onboarding) so a correction is a small edit, not a re-entry.
    // Note is intentionally left blank: staff must state a reason.
    const imageRightsForm = await superValidate(
      {
        decision: student.imageRightsDecision ?? undefined,
        signerPrenom:
          student.imageRightsSignerPrenom ?? student.parentPrenom ?? '',
        signerNom: student.imageRightsSignerNom ?? student.parentNom ?? '',
        note: '',
      },
      zod4(imageRightsCorrectionSchema),
      { errors: false, id: 'imageRights' },
    );

    // Decision history VM: flatten the recorded-by staff name, keep only what
    // the rail renders. Newest first (already ordered in the query). Each row
    // carries the school year it answers for, since the decision is taken once
    // per year and a history that did not say so would read as a string of
    // changes of mind.
    const imageRightsRecords = student.imageRightsRecords.map((r) => ({
      id: r.id,
      schoolYear: r.schoolYear,
      decision: r.decision,
      decidedAt: r.decidedAt,
      signerPrenom: r.signerPrenom,
      signerNom: r.signerNom,
      source: r.source,
      note: r.note,
      recordedByName: r.recordedBy?.user?.name ?? null,
    }));

    // The last decision ever taken, and the year it answered for. Feeds the
    // rail's stance, which is NOT the projection above it: an authorization
    // expires with its school year, an interdiction does not, so a refusal
    // nobody has revisited keeps forbidding while the dossier reads "En
    // attente". Resolved here rather than in the component so the ordering rule
    // (the decision instant, not the row's creation) lives with the query.
    const lastImageRightsDecision = student.imageRightsRecords[0]
      ? {
          decision: student.imageRightsRecords[0].decision,
          schoolYear: student.imageRightsRecords[0].schoolYear,
        }
      : null;

    // The dossier a correction recorded from this page would land on, resolved
    // exactly as `guardianActSchoolYear` resolves it server-side, so the dialog
    // names the year the write will actually use.
    const imageRightsSchoolYear =
      student.onboardingSchoolYear ?? currentSchoolYearLabel();

    // Backs the right rail's "première connexion" line and tells the dev whether
    // the talent ever logged in. Read from the durable `Talent.firstLoginAt`
    // projection (stamped once on first real login in hooks), not a bauth_session
    // probe: sessions are deleted by logout / identity repair, which would make
    // a real login read "Jamais".
    const firstLoginAt = student.firstLoginAt;

    return {
      student,
      notes,
      xpStory,
      journey,
      communications,
      firstLoginAt,
      timezone,
      imageRightsForm,
      imageRightsRecords,
      lastImageRightsDecision,
      imageRightsSchoolYear,
    };
  } catch (e) {
    // A genuinely missing talent (findUniqueOrThrow → P2025) is the only real
    // 404. Anything else (a DB/infra fault, a bug like a stale schema) must
    // surface as a 500, not masquerade as "introuvable" and hide the failure.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2025'
    ) {
      throw error(404, 'Participant introuvable');
    }
    console.error('Erreur chargement participant:', e);
    throw e;
  }
};

/**
 * Record a staff correction of the guardian's image-rights decision after an
 * offline change of mind. Routes through the same {@link recordImageRightsDecision}
 * service as the parent flow, so the projection, the ledger fact and the
 * regenerated PDF stay in lockstep: staff never touch a field by hand. The
 * fact is stamped `staff_correction` with the acting staff id + a mandatory
 * reason, keeping it auditable and distinct from a guardian's own decision.
 *
 * Dev-only and gated to the team that runs the stage (`devMember`).
 */
async function correctImageRights({ request, locals, params }: RequestEvent) {
  requireStaffGroup(locals, 'devMember');

  const form = await superValidate(request, zod4(imageRightsCorrectionSchema), {
    id: 'imageRights',
  });
  // Superforms routes by form id, so the conventional `form` key is correct.
  if (!form.valid) return fail(400, { form });

  const db = scopedPrisma(getCampusId(locals));
  const student = await db.talent.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      prenom: true,
      nom: true,
      // Carry the relationship + place-of-signature from the prior decision so
      // staff don't re-key them; both default cleanly in the PDF if absent.
      imageRightsRecords: {
        take: 1,
        orderBy: LATEST_IMAGE_RIGHTS_DECISION_ORDER,
        select: { relationship: true, city: true },
      },
    },
  });
  if (!student) {
    return message(form, 'Participant introuvable.', { status: 404 });
  }

  const prior = student.imageRightsRecords[0];
  await recordImageRightsDecision({
    talentId: student.id,
    decision: form.data.decision,
    signerPrenom: form.data.signerPrenom,
    signerNom: form.data.signerNom,
    relationship: prior?.relationship ?? 'représentant légal',
    city: prior?.city ?? '',
    source: 'staff_correction',
    recordedByStaffId: locals.staffProfile.id,
    note: form.data.note,
  });

  recordUsage(USAGE_FEATURES.DEV_IMAGE_RIGHTS_CORRECT, { locals });

  return message(form, "Décision de droit à l'image mise à jour.");
}

export const actions: Actions = {
  correctImageRights,
};
