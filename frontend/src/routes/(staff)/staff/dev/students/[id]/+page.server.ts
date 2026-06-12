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
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { interviewConductSchema } from '$lib/validation/interviews';
import {
  REVEAL_QUESTIONS,
  isRevealActive,
  type RevealTextField,
} from '$lib/domain/interview';
import {
  applyPhaseOverride,
  getEventStatus,
  getLifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { EVENT_TYPES } from '$lib/domain/event';
import { formatGivenName } from '$lib/domain/profile';
import { deriveTalentRecommendations } from '$lib/domain/talentRecommendations';
import { isRulesCompliant } from '$lib/domain/stageCompliance';
import { isImageRightsDecided } from '$lib/domain/imageRights';
import type { Communication } from '$lib/domain/communications';

// The scoped-down fiche keeps only the latest handful of communications, shown
// one-line each in the sticky right rail, no pagination. Volume per talent is
// in the low hundreds across a stage lifecycle, so fetch both sources unbounded,
// merge in memory, and slice the head.
const RIGHT_RAIL_COMMS = 6;

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
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
    ] = await Promise.all([
      db.talent.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          user: true,
          interests: { include: { interest: true } },
          school: { select: { name: true } },
        },
      }),
      db.participation.findMany({
        where: { talentId: params.id },
        select: {
          id: true,
          isPresent: true,
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
    ]);

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

    const timezone = getCampusTimezone(locals);
    const bounds = getLifecycleBounds(timezone);

    const activeStageParticipations = participations.filter((p) => {
      if (p.event.eventType !== EVENT_TYPES.STAGE_SECONDE) return false;
      const status = applyPhaseOverride(
        getEventStatus(p.event, bounds),
        locals.stagePhaseOverride,
      );
      return status === 'upcoming' || status === 'ongoing';
    });
    const primaryComplianceParticipation = activeStageParticipations[0] ?? null;

    // Interview conduct surface. The interview is 1:1 with the talent's active
    // stage participation, so we prefill the grid from any existing row (absence
    // = "à faire"). With no active stage there is nothing to attach to, so the
    // fiche disables "Faire l'entretien" with a reason and the actions refuse.
    const existingInterview = primaryComplianceParticipation
      ? await db.interview.findUnique({
          where: { participationId: primaryComplianceParticipation.id },
          include: {
            staff: { select: { user: { select: { name: true } } } },
          },
        })
      : null;

    const interviewForm = await superValidate(
      existingInterview
        ? {
            participationId: primaryComplianceParticipation!.id,
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
            teacherName: existingInterview.teacherName ?? '',
            teacherSubject: existingInterview.teacherSubject ?? '',
            oneSentence: existingInterview.oneSentence ?? '',
            interviewerNote: existingInterview.interviewerNote ?? '',
            discoveryChannelOther:
              existingInterview.discoveryChannelOther ?? '',
            specialtiesOther: existingInterview.specialtiesOther ?? '',
            otherJobsOther: existingInterview.otherJobsOther ?? '',
            infoSourcesOther: existingInterview.infoSourcesOther ?? '',
          }
        : { participationId: primaryComplianceParticipation?.id ?? '' },
      zod4(interviewConductSchema),
    );

    const canConductInterview = primaryComplianceParticipation != null;
    const noInterviewReason = canConductInterview
      ? null
      : 'Aucun stage de seconde en cours pour ce stagiaire.';

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
      participations,
      activeStageParticipations,
      primaryComplianceParticipation,
      communications,
      firstLoginAt,
      recommendations,
      timezone,
      interviewForm,
      canConductInterview,
      noInterviewReason,
      interviewStatus: existingInterview?.status ?? null,
      interviewConductedAt: existingInterview?.conductedAt ?? null,
      interviewConductedBy: existingInterview?.staff.user?.name ?? null,
    };
  } catch (e) {
    // A genuinely missing talent (findUniqueOrThrow → P2025) is the only real
    // 404. Anything else (a DB/infra fault, a bug like a stale schema) must
    // surface as a 500, not masquerade as "introuvable" and hide the failure.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2025'
    ) {
      throw error(404, 'Stagiaire introuvable');
    }
    console.error('Erreur chargement stagiaire:', e);
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
 * Dev-only (Talent Acquisition conducts interviews), stage-gated, re-validated.
 */
async function persistInterview(
  { request, locals, params }: RequestEvent,
  mode: InterviewMode,
) {
  requireStaffGroup(locals, 'devMember');
  requireFlag(locals, 'stage_seconde');

  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);

  const form = await superValidate(request, zod4(interviewConductSchema));
  if (!form.valid) return fail(400, { form });

  const participation = await db.participation.findUnique({
    where: { id: form.data.participationId },
    select: {
      id: true,
      talentId: true,
      campusId: true,
      event: { select: { eventType: true } },
    },
  });
  if (
    !participation ||
    participation.talentId !== params.id ||
    participation.campusId !== campusId ||
    participation.event.eventType !== EVENT_TYPES.STAGE_SECONDE
  ) {
    return message(form, 'Entretien impossible pour ce stagiaire.', {
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

  const { participationId, oneSentence, interviewerNote, ...rest } = form.data;

  // Reveal-gated free text (teacher name/subject, the "Autre" precisions): trim,
  // and clear when its trigger choice is not selected so the DB never keeps a
  // precision orphaned from the answer that unlocked it. Catalogue-driven, so a
  // new "Autre" precision needs no change here. `data` reads both the trigger
  // value (an enum or an array) and the raw text by field name.
  const data = form.data as Record<string, unknown>;
  const revealText = {} as Record<RevealTextField, string | null>;
  for (const q of REVEAL_QUESTIONS) {
    const active = isRevealActive(q.reveal, data[q.field]);
    for (const rf of q.reveal.fields) {
      const raw = data[rf.field];
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      revealText[rf.field] = active && trimmed ? trimmed : null;
    }
  }

  const answers = {
    ...rest,
    oneSentence: oneSentence.trim() || null,
    interviewerNote: interviewerNote.trim() || null,
    ...revealText,
  };

  const createStatus = mode === 'close' ? 'done' : 'in_progress';
  // `save` leaves the status untouched; the other modes set it explicitly.
  const setStatus =
    mode === 'close'
      ? ('done' as const)
      : mode === 'start'
        ? ('in_progress' as const)
        : undefined;

  await db.interview.upsert({
    where: { participationId },
    create: {
      participationId,
      talentId: participation.talentId,
      campusId,
      staffId: locals.staffProfile.id,
      status: createStatus,
      ...answers,
    },
    update: {
      ...answers,
      ...(setStatus ? { status: setStatus } : {}),
    },
  });

  // Success carries no flash: the conduct UI signals each lifecycle outcome
  // through its view transition (cover ⇆ questions ⇆ synthèse), not a toast.
  return { form };
}

export const actions: Actions = {
  startInterview: (event) => persistInterview(event, 'start'),
  saveInterview: (event) => persistInterview(event, 'save'),
  closeInterview: (event) => persistInterview(event, 'close'),
};
