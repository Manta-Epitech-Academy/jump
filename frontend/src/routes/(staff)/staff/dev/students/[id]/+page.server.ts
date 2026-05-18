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

const TAB_KEYS = ['pedago', 'admin'] as const;
type TabKey = (typeof TAB_KEYS)[number];

function validateTab(raw: string | null): TabKey {
  return TAB_KEYS.includes(raw as TabKey) ? (raw as TabKey) : 'pedago';
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  try {
    const [student, participations, reminderRows] = await Promise.all([
      db.talent.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          user: true,
          interests: { include: { interest: true } },
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
          subject: true,
          body: true,
          sentAt: true,
          sentBy: true,
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
    const reminders = reminderRows.map((r) => ({
      id: r.id,
      type: r.type as 'student' | 'parent',
      subject: r.subject,
      body: r.body,
      sentAt: r.sentAt,
      sender: senderById.get(r.sentBy) ?? null,
    }));

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
    const tab = validateTab(url.searchParams.get('tab'));

    return {
      student,
      participations,
      activeStageParticipations,
      reminders,
      stats,
      portfolioItems,
      firstLoginAt,
      badges,
      timelineGroups,
      form,
      relanceForm,
      tab,
      timezone,
    };
  } catch (e) {
    console.error('Erreur chargement Talent:', e);
    throw error(404, 'Talent introuvable');
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
          niveauDifficulte: form.data.niveau_difficulte || 'Débutant',
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
          'Un Talent avec ce nom et cet email existe déjà.',
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
      subject: form.data.subject,
      body: form.data.body,
      sentBy: locals.user!.id,
      campusId,
    });

    return message(form, formatRelanceMessage(result));
  },
};
