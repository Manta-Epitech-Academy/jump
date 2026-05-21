import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { broadcastSchema } from '$lib/validation/broadcasts';
import { resolveRecipients } from '$lib/server/services/broadcast/recipients';
import {
  enqueueBroadcast,
  processBroadcast,
} from '$lib/server/services/broadcast/orchestrator';
import {
  substituteVariables,
  buildDemoContext,
} from '$lib/domain/broadcastVariables';
import {
  rewriteHtmlLinks,
  rewriteSmsLinks,
} from '$lib/server/services/broadcast/linkRewriter';
import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
import { sendEmail, MAIL_FROM } from '$lib/server/email';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ url }) => {
  const templateIdParam = url.searchParams.get('template') ?? undefined;

  const [templates, campuses] = await Promise.all([
    prisma.messageTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        channel: true,
        subject: true,
        body: true,
      },
    }),
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const events = await prisma.event.findMany({
    orderBy: { date: 'desc' },
    take: 200,
    select: {
      id: true,
      titre: true,
      date: true,
      campusId: true,
    },
  });

  const sourceBroadcasts = await prisma.broadcast.findMany({
    where: { status: { in: ['sent', 'partial_failed'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      channel: true,
      createdAt: true,
      campusId: true,
    },
  });

  const form = await superValidate(
    {
      name: '',
      templateId: templateIdParam ?? '',
      campusId: '',
      audience: 'talent' as const,
      eventId: '',
      sourceBroadcastId: '',
      filters: {},
    },
    zod4(broadcastSchema),
    { errors: false },
  );

  return { form, templates, campuses, events, sourceBroadcasts };
};

export const actions: Actions = {
  preview: async ({ request }) => {
    const form = await superValidate(request, zod4(broadcastSchema));
    if (!form.valid) return fail(400, { form });

    const template = await prisma.messageTemplate.findUnique({
      where: { id: form.data.templateId },
      select: { channel: true },
    });
    if (!template)
      return fail(400, { form, previewError: 'Template introuvable' });

    const { recipients, excluded } = await resolveRecipients(
      {
        campusId: form.data.campusId,
        audience: form.data.audience,
        eventId: form.data.eventId || null,
        filters: form.data.filters ?? null,
        sourceBroadcastId: form.data.sourceBroadcastId || null,
        sourceFilter: form.data.sourceFilter ?? null,
      },
      template.channel,
    );

    return {
      form,
      preview: {
        total: recipients.length,
        excluded,
        sample: recipients.slice(0, 10).map((r) => ({
          name: `${r.prenom} ${r.nom}`.trim(),
          email: r.email,
          phone: r.phone,
        })),
      },
    };
  },

  testSend: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(broadcastSchema));
    if (!form.valid) return fail(400, { form });
    if (!locals.user?.email) {
      return message(form, "Tu n'as pas d'email sur ton compte.", {
        status: 400,
      });
    }

    const template = await prisma.messageTemplate.findUnique({
      where: { id: form.data.templateId },
      select: { channel: true, subject: true, body: true },
    });
    if (!template) {
      return message(form, 'Template introuvable.', { status: 400 });
    }
    if (template.channel === 'sms') {
      return message(
        form,
        'Test SMS pas encore supporté (pas de provider configuré).',
        { status: 400 },
      );
    }

    const event = form.data.eventId
      ? await prisma.event.findUnique({
          where: { id: form.data.eventId },
          select: { titre: true },
        })
      : null;

    const ctx = buildDemoContext(event?.titre);
    const subject = template.subject
      ? `[TEST] ${substituteVariables(template.subject, ctx)}`
      : '[TEST] Envoi en masse';
    const body = rewriteHtmlLinks(
      renderBroadcastMail(
        substituteVariables(template.body, ctx),
        env.ORIGIN ?? '',
      ),
      'TEST_TRACKING_ID',
    );

    const result = await sendEmail({
      from: MAIL_FROM,
      to: locals.user.email,
      subject,
      html: body,
    });

    if (!result.ok) {
      return message(form, `Échec : ${result.message}`, { status: 500 });
    }
    return message(form, `Test envoyé à ${locals.user.email}.`);
  },

  enqueue: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(broadcastSchema));
    if (!form.valid) return fail(400, { form });
    if (!locals.user) return fail(401, { form });

    const { broadcastId } = await enqueueBroadcast({
      name: form.data.name,
      templateId: form.data.templateId,
      campusId: form.data.campusId,
      audience: form.data.audience,
      eventId: form.data.eventId || null,
      sourceBroadcastId: form.data.sourceBroadcastId || null,
      sourceFilter: form.data.sourceFilter ?? null,
      filters: form.data.filters ?? null,
      createdById: locals.user.id,
    });

    // Process inline (fire-and-forget). For larger volumes, route to a worker.
    processBroadcast(broadcastId).catch((err) => {
      console.error(`[broadcast ${broadcastId}] processing failed`, err);
    });

    redirect(303, `/staff/admin/broadcasts/${broadcastId}`);
  },
};
