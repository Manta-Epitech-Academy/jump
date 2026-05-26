import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
import { sendRelanceSchema } from '$lib/validation/reminders';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  applyPhaseOverride,
  getEventStatus,
  getLifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { EVENT_TYPES } from '$lib/domain/event';
import {
  sendRelances,
  formatRelanceMessage,
} from '$lib/server/services/relanceService';
import { buildBadgeCtx, computeBadges } from '$lib/domain/badges';
import { groupParticipations } from '$lib/domain/talentTimeline';
import { loadAllRelanceDefaults } from '$lib/server/services/relanceDefaults';
import { generateTalentOtp } from '$lib/server/services/talentOtp';
import { isSmsEnabled } from '$lib/server/sms';
import type { Communication } from '$lib/domain/communications';

const TAB_KEYS = ['pedago', 'admin'] as const;
type TabKey = (typeof TAB_KEYS)[number];

function validateTab(raw: string | null): TabKey {
  return TAB_KEYS.includes(raw as TabKey) ? (raw as TabKey) : 'pedago';
}

// Communications timeline: per-talent volume caps in the low hundreds
// (≤20 reminders + ≤200ish broadcast recipients across a stage lifecycle),
// so we fetch both sources unbounded and merge in memory rather than
// stitching a SQL UNION with per-source offsets that would never line up.
const COMMUNICATIONS_PAGE_SIZE = 20;

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  const tab = validateTab(url.searchParams.get('tab'));
  const communicationsPage = parsePage(url.searchParams.get('page'));
  const broadcastsWhere = {
    OR: [{ talentId: params.id }, { parentOfTalentId: params.id }],
  };
  try {
    const [student, participations, reminderRows, broadcastRows] =
      await Promise.all([
        db.talent.findUniqueOrThrow({
          where: { id: params.id },
          include: {
            user: true,
            interests: { include: { interest: true } },
            school: { select: { name: true } },
            interviews: {
              where: { campusId },
              include: {
                staff: { include: { user: true } },
                participation: { include: { event: true } },
              },
              orderBy: { date: 'desc' },
            },
          },
        }),
        db.participation.findMany({
          where: { talentId: params.id },
          include: {
            stageCompliance: true,
            interview: true,
            event: {
              include: {
                mantas: {
                  include: { staffProfile: { include: { user: true } } },
                },
              },
            },
            activities: {
              include: {
                activity: {
                  include: {
                    activityThemes: { include: { theme: true } },
                    timeSlot: true,
                  },
                },
                verdictAuthor: { include: { user: true } },
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
              },
            },
          },
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
      },
    }));
    const allCommunications = [...reminderComms, ...broadcastComms].sort(
      (a, b) => b.sentAt.getTime() - a.sentAt.getTime(),
    );
    const communicationsTotal = allCommunications.length;
    const communicationsTotalPages = Math.max(
      1,
      Math.ceil(communicationsTotal / COMMUNICATIONS_PAGE_SIZE),
    );
    const safeCommunicationsPage = Math.min(
      communicationsPage,
      communicationsTotalPages,
    );
    const communications = allCommunications.slice(
      (safeCommunicationsPage - 1) * COMMUNICATIONS_PAGE_SIZE,
      safeCommunicationsPage * COMMUNICATIONS_PAGE_SIZE,
    );

    // `reminders` is still consumed by the relance compose dialog to detect
    // recent skips (don't re-spam the same talent within the cooldown).
    const reminders = reminderComms;

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

    // Second wave — independent queries fired in parallel once `userId` is
    // known. Cohort rank dropped per design feedback (hero is now identity-
    // only); the page no longer carries that signal.
    const [portfolioItems, firstLoginRow] = await Promise.all([
      db.portfolioItem.findMany({
        where: { talentId: params.id },
        include: {
          event: { select: { id: true, titre: true, date: true } },
          activity: { select: { id: true, nom: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      student.userId
        ? prisma.bauth_session.findFirst({
            where: { userId: student.userId },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
    ]);

    const firstLoginAt = firstLoginRow?.createdAt ?? null;

    const stats = {
      totalEvents: participations.length,
      presentCount: participations.filter((p) => p.isPresent).length,
      lateCount: participations.filter((p) => p.isPresent && (p.delay || 0) > 0)
        .length,
      favoriteTheme: 'Aucun',
    };

    const themeCounts: Record<string, number> = {};
    participations.forEach((p) => {
      if (p.isPresent) {
        p.activities.forEach((pa) => {
          if (pa.activity.activityType === 'orga') return;
          pa.activity.activityThemes.forEach((at) => {
            themeCounts[at.theme.nom] = (themeCounts[at.theme.nom] || 0) + 1;
          });
        });
      }
    });

    const sortedThemes = Object.entries(themeCounts).sort(
      (a, b) => b[1] - a[1],
    );
    if (sortedThemes.length > 0) {
      stats.favoriteTheme = sortedThemes[0][0];
    }

    const badges = computeBadges(
      buildBadgeCtx({
        talent: {
          xp: student.xp,
          eventsCount: student.eventsCount,
          charterAcceptedAt: student.charterAcceptedAt,
          interests: student.interests,
        },
        participations,
        portfolioItems,
        interviews: student.interviews,
      }),
    );

    const timelineGroups = groupParticipations(
      participations,
      timezone,
      locals.stagePhaseOverride,
    );

    const form = await superValidate(zod4(studentSchema));
    const relanceForm = await superValidate(zod4(sendRelanceSchema));
    const relanceDefaults = await loadAllRelanceDefaults();

    return {
      student,
      participations,
      activeStageParticipations,
      reminders,
      communications,
      communicationsTotal,
      communicationsPage: safeCommunicationsPage,
      communicationsPageSize: COMMUNICATIONS_PAGE_SIZE,
      stats,
      portfolioItems,
      firstLoginAt,
      badges,
      timelineGroups,
      form,
      relanceForm,
      relanceDefaults,
      smsEnabled: isSmsEnabled(),
      tab,
      timezone,
    };
  } catch (e) {
    console.error('Erreur chargement stagiaire:', e);
    throw error(404, 'Stagiaire introuvable');
  }
};

export const actions: Actions = {
  update: async ({ request, params, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(studentSchema));
    if (!form.valid) return fail(400, { form });
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.talent.update({
        where: { id: params.id },
        data: {
          nom: form.data.nom,
          prenom: form.data.prenom,
          niveau: form.data.niveau || null,
          parentEmail: form.data.parent_email
            ? form.data.parent_email.toLowerCase().trim()
            : null,
          parentPhone: form.data.parent_phone || null,
          parentNom: form.data.parent_nom?.trim() || null,
          parentPrenom: form.data.parent_prenom?.trim() || null,
          phone: form.data.phone || null,
        },
      });

      if (form.data.email) {
        const profile = await db.talent.findUniqueOrThrow({
          where: { id: params.id },
        });
        if (profile.userId) {
          await prisma.bauth_user.update({
            where: { id: profile.userId },
            data: { email: form.data.email },
          });
        }
      }

      return message(form, 'Profil mis à jour avec succès !');
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        return message(
          form,
          'Un stagiaire avec ce nom et cet email existe déjà.',
          {
            status: 400,
          },
        );
      }
      return message(form, 'Erreur lors de la mise à jour', { status: 500 });
    }
  },

  sendRelance: async ({ request, params, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const campusId = getCampusId(locals);
    const db = scopedPrisma(campusId);

    // Confirm the talent exists in the staff member's campus before sending.
    await db.talent.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true },
    });

    const formData = await request.formData();
    const form = await superValidate(formData, zod4(sendRelanceSchema));
    if (!form.valid) {
      return message(form, 'Données invalides.', { status: 400 });
    }

    // Force the talentIds payload to the URL-scoped talent so the dialog
    // can't be reused to fan out to arbitrary recipients.
    const result = await sendRelances({
      talentIds: [params.id],
      type: form.data.type,
      channel: form.data.channel,
      subject: form.data.subject,
      body: form.data.body,
      sentBy: locals.user!.id,
      campusId,
    });

    return message(form, formatRelanceMessage(result));
  },

  generateOtp: async ({ params, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const db = scopedPrisma(getCampusId(locals));
    // Re-fetch in the campus scope so a dev can't mint an OTP for a talent
    // outside their campus by guessing the id.
    await db.talent.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true },
    });
    try {
      const result = await generateTalentOtp(params.id);
      console.log(
        `[otp] staff=${locals.user!.id} minted sign-in OTP for talent=${params.id}`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inattendue';
      return fail(400, { message });
    }
  },
};
