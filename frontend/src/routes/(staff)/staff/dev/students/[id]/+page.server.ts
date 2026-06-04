import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
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
import { deriveTalentTodos } from '$lib/domain/talentTodos';
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
    const [student, participations, reminderRows, broadcastRows] =
      await Promise.all([
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

    // First platform login (oldest session) backs the right rail's "première
    // connexion" line and tells the dev whether the talent ever logged in.
    const firstLoginRow = student.userId
      ? await prisma.bauth_session.findFirst({
          where: { userId: student.userId },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        })
      : null;
    const firstLoginAt = firstLoginRow?.createdAt ?? null;

    // Email-open signal: only broadcasts carry `openedAt`. "Never opened" is
    // only a meaningful nudge once at least one mail actually went out.
    const mailsSent = broadcastRows.filter(
      (b) => b.broadcast.channel === 'mail' && b.sentAt,
    ).length;
    const hasOpenedAnyMail = broadcastRows.some((b) => b.openedAt != null);

    const todos = deriveTalentTodos({
      ...student,
      charteSigned:
        primaryComplianceParticipation?.stageCompliance?.charteSigned,
      mailsSent,
      hasOpenedAnyMail,
    });

    // Empty scaffold for the contact-edit dialog (the only mutation left on the
    // scoped fiche).
    const form = await superValidate(zod4(studentSchema));

    return {
      student,
      participations,
      activeStageParticipations,
      primaryComplianceParticipation,
      communications,
      firstLoginAt,
      todos,
      form,
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
};
