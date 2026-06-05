import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  applyPhaseOverride,
  getEventStatus,
  getLifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { EVENT_TYPES } from '$lib/domain/event';
import { capitalize } from '$lib/utils';
import { deriveTalentRecommendations } from '$lib/domain/talentRecommendations';
import { isRulesCompliant } from '$lib/domain/stageCompliance';
import { isImageRightsDecided } from '$lib/domain/imageRights';
import type { Communication } from '$lib/domain/communications';

// The scoped-down fiche keeps only the latest handful of communications, shown
// one-line each in the sticky right rail — no pagination. Volume per talent is
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
      firstLoginRow,
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
        where: { talentId: params.id, status: 'completed' },
      }),
      // First platform login (oldest session). Keyed on the talent relation so
      // it parallelizes with the fetch above instead of waiting on its userId;
      // a cross-campus id still 404s via the scoped talent fetch in this batch.
      prisma.bauth_session.findFirst({
        where: { user: { talent: { id: params.id } } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
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

    // Backs the right rail's "première connexion" line and tells the dev
    // whether the talent ever logged in (fetched in the batch above).
    const firstLoginAt = firstLoginRow?.createdAt ?? null;

    const charteSigned =
      primaryComplianceParticipation?.stageCompliance?.charteSigned;

    // Event-opportunity recommendations (REC-005): one per tech interest the
    // student picked that carries a curated `recommendationMessage`, shown
    // verbatim.
    const techRecommendationMessages = student.interests
      .map((ti) => ti.interest)
      .filter((i) => i.kind === 'tech' && i.recommendationMessage != null)
      .map((i) => i.recommendationMessage as string);

    const recommendations = deriveTalentRecommendations({
      ...student,
      prenom: capitalize(student.prenom),
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
    };
  } catch (e) {
    console.error('Erreur chargement stagiaire:', e);
    throw error(404, 'Stagiaire introuvable');
  }
};
