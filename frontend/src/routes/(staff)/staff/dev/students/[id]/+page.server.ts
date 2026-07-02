import type { PageServerLoad, Actions, RequestEvent } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { Prisma } from '@prisma/client';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { NOTE_INCLUDE, serializeNote } from '$lib/server/talentNotes';
import { interviewConductSchema } from '$lib/validation/interviews';
import { NOTE_FIELDS, type NoteField } from '$lib/domain/interview';
import { EVENT_TYPES } from '$lib/domain/event';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { formatGivenName } from '$lib/domain/profile';
import { deriveTalentRecommendations } from '$lib/domain/talentRecommendations';
import { isRulesCompliant } from '$lib/domain/stageCompliance';
import { isImageRightsDecided } from '$lib/domain/imageRights';
import { recordImageRightsDecision } from '$lib/server/services/imageRightsService';
import { imageRightsCorrectionSchema } from '$lib/validation/imageRights';
import type { Communication } from '$lib/domain/communications';
import { getTalentXpStory } from '$lib/server/services/xpStoryService';
import { listAttendedEvents } from '$lib/server/talent/attendedEvents';

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
    const [
      student,
      participations,
      reminderRows,
      broadcastRows,
      completedInterviewCount,
      xpStory,
      noteRows,
      eventHistory,
    ] = await Promise.all([
      db.talent.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          user: true,
          interests: { include: { interest: true } },
          school: { select: { name: true } },
          // Image-rights decision history (newest first) for the audit trail in
          // the rail: who decided what and when, parent vs staff correction.
          imageRightsRecords: {
            orderBy: { createdAt: 'desc' },
            include: {
              recordedBy: { select: { user: { select: { name: true } } } },
            },
          },
        },
      }),
      db.participation.findMany({
        where: { talentId: params.id },
        select: {
          id: true,
          stageCompliance: {
            select: { charteSigned: true, updatedAt: true },
          },
          event: {
            select: {
              id: true,
              titre: true,
              date: true,
              endDate: true,
              eventType: true,
              modules: { select: { moduleKey: true } },
            },
          },
        },
        orderBy: { event: { date: 'desc' } },
      }),
      prisma.onboardingReminder.findMany({
        where: { talentId: params.id },
        orderBy: { sentAt: 'desc' },
        select: {
          id: true,
          type: true,
          channel: true,
          subject: true,
          body: true,
          sentAt: true,
          sentBy: true,
        },
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
      db.interview.count({
        where: { talentId: params.id, status: 'done' },
      }),
      getTalentXpStory(params.id, timezone),
      // Staff notes feed (newest first). Visibility is already asserted by the
      // scoped `student` query above resolving for this campus.
      prisma.note_TalentNote.findMany({
        where: { talentId: params.id },
        orderBy: { createdAt: 'desc' },
        include: NOTE_INCLUDE,
      }),
      listAttendedEvents(params.id, { timeZone: timezone }),
    ]);

    const notes = noteRows.map(serializeNote);

    const senderIds = Array.from(new Set(reminderRows.map((r) => r.sentBy)));
    const senders = senderIds.length
      ? await prisma.bauth_user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const senderById = new Map(senders.map((s) => [s.id, s]));

    // Merge both sources into one chronological stream. `sentAt` is the
    // canonical timestamp for the talent ("when did this land"); broadcasts
    // fall back to the broadcast's createdAt when the recipient row has not
    // been stamped yet (queued/pending).
    const reminderComms: Communication[] = reminderRows.map((r) => ({
      kind: 'reminder',
      id: r.id,
      sentAt: r.sentAt,
      audience: r.type as 'student' | 'parent',
      channel: r.channel as 'email' | 'sms',
      subject: r.subject,
      body: r.body,
      sender: senderById.get(r.sentBy) ?? null,
    }));
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
    const allCommunications = [...reminderComms, ...broadcastComms].sort(
      (a, b) => b.sentAt.getTime() - a.sentAt.getTime(),
    );
    const communications = allCommunications.slice(0, RIGHT_RAIL_COMMS);

    // Compliance (charte, droits à l'image) is a stage-de-seconde artifact: it
    // always attaches to the talent's latest stage participation, whatever event
    // the fiche was opened from. `participations` is `event.date desc`, so [0] is
    // the latest stage.
    const stageParticipations = participations.filter(
      (p) => p.event.eventType === EVENT_TYPES.STAGE_SECONDE,
    );
    const primaryComplianceParticipation = stageParticipations[0] ?? null;

    // Interview conduct surface. The orientation interview is 1:1 with a
    // participation (one per person per event) and is offered on any event that
    // exposes the `entretiens` module - not only the stage. The entretiens page
    // links here with `?event=<id>`, so we attach to THAT event's participation;
    // opened without context (search, deep link) we fall back to the latest
    // interviewable one, stage first for backward-compatible behaviour. Staff
    // routinely type up paper interviews long after, so lifecycle phase is
    // irrelevant here. With no interviewable participation the fiche disables
    // "Faire l'entretien" with a reason and the actions refuse.
    const interviewable = participations.filter((p) =>
      p.event.modules.some((m) => m.moduleKey === EVENT_MODULES.ENTRETIENS),
    );
    const eventParam = url.searchParams.get('event');
    const interviewParticipation =
      (eventParam
        ? interviewable.find((p) => p.event.id === eventParam)
        : null) ??
      interviewable.find(
        (p) => p.event.eventType === EVENT_TYPES.STAGE_SECONDE,
      ) ??
      interviewable[0] ??
      null;

    const existingInterview = interviewParticipation
      ? await db.interview.findUnique({
          where: { participationId: interviewParticipation.id },
          include: {
            staff: {
              select: { user: { select: { name: true, image: true } } },
            },
          },
        })
      : null;

    const interviewForm = await superValidate(
      existingInterview
        ? {
            participationId: interviewParticipation!.id,
            discoveryChannel: existingInterview.discoveryChannel,
            motivation: existingInterview.motivation,
            orientationTalkAtSchool: existingInterview.orientationTalkAtSchool,
            passionateTeacher: existingInterview.passionateTeacher,
            techProjection: existingInterview.techProjection,
            wantsMore: existingInterview.wantsMore,
            recommendation: existingInterview.recommendation,
            specialties: existingInterview.specialties,
            otherJobs: existingInterview.otherJobs,
            infoSources: existingInterview.infoSources,
            nextYearEvents: existingInterview.nextYearEvents,
            satisfactionStars: existingInterview.satisfactionStars,
            oneSentence: existingInterview.oneSentence ?? '',
            verdictNote: existingInterview.verdictNote ?? '',
            discoveryChannelNote: existingInterview.discoveryChannelNote ?? '',
            motivationNote: existingInterview.motivationNote ?? '',
            specialtiesNote: existingInterview.specialtiesNote ?? '',
            orientationTalkNote: existingInterview.orientationTalkNote ?? '',
            passionateTeacherNote:
              existingInterview.passionateTeacherNote ?? '',
            techProjectionNote: existingInterview.techProjectionNote ?? '',
            otherJobsNote: existingInterview.otherJobsNote ?? '',
            infoSourcesNote: existingInterview.infoSourcesNote ?? '',
            wantsMoreNote: existingInterview.wantsMoreNote ?? '',
            satisfactionNote: existingInterview.satisfactionNote ?? '',
            nextYearEventsNote: existingInterview.nextYearEventsNote ?? '',
          }
        : { participationId: interviewParticipation?.id ?? '' },
      zod4(interviewConductSchema),
    );

    const canConductInterview = interviewParticipation != null;
    const noInterviewReason = canConductInterview
      ? null
      : "Ce talent n'a aucun événement avec les entretiens activés.";

    // Staff correction form for the image-rights decision, prefilled with the
    // current decision + the guardian on file (the last signer, else the parent
    // captured at onboarding) so a correction is a small edit, not a re-entry.
    // Note is intentionally left blank — staff must state a reason.
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
    // the rail renders. Newest first (already ordered in the query).
    const imageRightsRecords = student.imageRightsRecords.map((r) => ({
      id: r.id,
      decision: r.decision,
      decidedAt: r.decidedAt,
      signerPrenom: r.signerPrenom,
      signerNom: r.signerNom,
      source: r.source,
      note: r.note,
      recordedByName: r.recordedBy?.user?.name ?? null,
    }));

    // Backs the right rail's "première connexion" line and tells the dev whether
    // the talent ever logged in. Read from the durable `Talent.firstLoginAt`
    // projection (stamped once on first real login in hooks), not a bauth_session
    // probe: sessions are deleted by logout / identity repair, which would make
    // a real login read "Jamais".
    const firstLoginAt = student.firstLoginAt;

    const charteSigned =
      primaryComplianceParticipation?.stageCompliance?.charteSigned;

    // Event-opportunity recommendations (REC-005): one per tech interest the
    // student picked that carries a curated `recommendationMessage`, shown
    // verbatim.
    const techRecommendationMessages = student.interests
      .map((ti) => ti.interest)
      .filter((i) => i.kind === 'tech' && i.recommendationMessage != null)
      .map((i) => i.recommendationMessage as string);

    // REC-001/003 name the public app URL the student and their parents should
    // reach. Pull it from config so it auto-tracks the environment instead of
    // hardcoding (ORIGIN = https://jump.epiboost.fr in prod).
    const appUrl = env.ORIGIN ?? '';

    const recommendations = deriveTalentRecommendations({
      ...student,
      prenom: formatGivenName(student.prenom),
      appUrl,
      connected: firstLoginAt != null,
      rulesCompliant: isRulesCompliant(
        student.parentRulesSignedAt,
        charteSigned,
      ),
      imageRightsDecided: isImageRightsDecided(student),
      hasCompletedInterview: completedInterviewCount > 0,
      techRecommendationMessages,
    });

    return {
      student,
      notes,
      xpStory,
      participations,
      eventHistory,
      primaryComplianceParticipation,
      communications,
      firstLoginAt,
      recommendations,
      timezone,
      interviewForm,
      imageRightsForm,
      imageRightsRecords,
      canConductInterview,
      noInterviewReason,
      interviewStatus: existingInterview?.status ?? null,
      interviewConductedAt: existingInterview?.conductedAt ?? null,
      interviewConductedBy: existingInterview?.staff.user?.name ?? null,
      interviewConductedByImage: existingInterview?.staff.user?.image ?? null,
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

type InterviewMode = 'start' | 'save' | 'close';

/**
 * Upsert the orientation interview for the talent's active stage participation.
 * The status transition is owned by the `mode`, never read from the payload, so
 * an autosave can never accidentally close an interview:
 *   - `start`  → create the row `in_progress` (the "Démarrer l'entretien" CTA)
 *   - `save`   → autosave answers, status unchanged
 *   - `close`  → flip to `done` (the "Clôturer l'entretien" CTA)
 * Clôture is a one-way door: a `done` interview is locked for good (guarded
 * below), so the lifecycle only ever runs null → in_progress → done.
 * Dev-only (Talent Acquisition conducts interviews); gated per participation on
 * its event's `entretiens` module, re-validated.
 */
async function persistInterview(
  { request, locals, params }: RequestEvent,
  mode: InterviewMode,
) {
  requireStaffGroup(locals, 'devMember');

  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);

  const form = await superValidate(request, zod4(interviewConductSchema));
  if (!form.valid) return fail(400, { form });

  // Gated per participation on the `entretiens` module of its event, not on the
  // event type: any event exposing entretiens (stage, coding club…) can be
  // interviewed, one interview per participation.
  const participation = await db.participation.findUnique({
    where: { id: form.data.participationId },
    select: {
      id: true,
      talentId: true,
      campusId: true,
      event: {
        select: {
          modules: {
            where: { moduleKey: EVENT_MODULES.ENTRETIENS },
            select: { moduleKey: true },
          },
        },
      },
    },
  });
  if (
    !participation ||
    participation.talentId !== params.id ||
    participation.campusId !== campusId ||
    participation.event.modules.length === 0
  ) {
    return message(form, 'Entretien impossible pour ce participant.', {
      status: 400,
    });
  }

  // Clôture is terminal: once `done`, the interview is locked for good. Refuse
  // any further mutation (autosave, re-close, or a stray start) server-side so
  // the lock holds even against a replayed or hand-crafted POST, not just the
  // removed UI controls.
  const existing = await db.interview.findUnique({
    where: { participationId: form.data.participationId },
    select: { status: true },
  });
  if (existing?.status === 'done') {
    return message(
      form,
      'Cet entretien est finalisé et ne peut plus être modifié.',
      {
        status: 409,
      },
    );
  }

  const { participationId, oneSentence, verdictNote, ...rest } = form.data;

  // Per-question notes: trim and store '' as null so the DB never holds "". The
  // notes are ungated (always offered under their question), so there is nothing
  // to clear on a deselect, unlike the old reveal precisions. Catalogue-driven
  // via NOTE_FIELDS: a new note needs no change here.
  const data = form.data as Record<string, unknown>;
  const noteText = {} as Record<NoteField, string | null>;
  for (const field of NOTE_FIELDS) {
    const raw = data[field];
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    noteText[field] = trimmed || null;
  }

  const answers = {
    ...rest,
    oneSentence: oneSentence.trim() || null,
    verdictNote: verdictNote.trim() || null,
    ...noteText,
  };

  const createStatus = mode === 'close' ? 'done' : 'in_progress';
  // `save` leaves the status untouched; the other modes set it explicitly.
  const setStatus =
    mode === 'close'
      ? ('done' as const)
      : mode === 'start'
        ? ('in_progress' as const)
        : undefined;

  // `conductedAt` defaults to row-creation time, i.e. when the interview is
  // first started or autosaved as `in_progress`. Re-stamp it at clôture so it
  // marks when the interview was finalized, not when the form was first opened.
  // Everything downstream treats a `done` interview's `conductedAt` as its
  // completion date (the admin PDF list orders and dates by it, the reset audit
  // snapshots it), so a just-closed interview must carry "now" even if it sat in
  // progress for a while.
  const conductedAt = mode === 'close' ? new Date() : undefined;

  await db.interview.upsert({
    where: { participationId },
    create: {
      participationId,
      talentId: participation.talentId,
      campusId,
      staffId: locals.staffProfile.id,
      status: createStatus,
      ...(conductedAt ? { conductedAt } : {}),
      ...answers,
    },
    update: {
      ...answers,
      ...(setStatus ? { status: setStatus } : {}),
      ...(conductedAt ? { conductedAt } : {}),
    },
  });

  // Success carries no flash: the conduct UI signals each lifecycle outcome
  // through its view transition (cover ⇆ questions ⇆ synthèse), not a toast.
  return { form };
}

/**
 * Record a staff correction of the guardian's image-rights decision after an
 * offline change of mind. Routes through the same {@link recordImageRightsDecision}
 * service as the parent flow, so the projection, the ledger fact and the
 * regenerated PDF stay in lockstep — staff never touch a field by hand. The
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
  // Superforms routes by form id, so the conventional `form` key is correct
  // even with the interview form on the same page.
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
        orderBy: { createdAt: 'desc' },
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
    studentName: `${student.prenom} ${student.nom}`,
    decision: form.data.decision,
    signerPrenom: form.data.signerPrenom,
    signerNom: form.data.signerNom,
    relationship: prior?.relationship ?? 'représentant légal',
    city: prior?.city ?? '',
    source: 'staff_correction',
    recordedByStaffId: locals.staffProfile.id,
    note: form.data.note,
  });

  return message(form, "Décision de droit à l'image mise à jour.");
}

export const actions: Actions = {
  startInterview: (event) => persistInterview(event, 'start'),
  saveInterview: (event) => persistInterview(event, 'save'),
  closeInterview: (event) => persistInterview(event, 'close'),
  correctImageRights,
};
