import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { broadcastSchema } from '$lib/validation/broadcasts';
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

export const load: PageServerLoad = async ({ url, locals }) => {
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

  return {
    form,
    templates,
    campuses,
    events,
    sourceBroadcasts,
    userEmail: locals.user?.email ?? '',
  };
};

export const actions: Actions = {
  testSend: async ({ request, locals }) => {
    const formData = await request.formData();
    const testEmailRaw = (formData.get('testEmail') as string | null)?.trim();
    const form = await superValidate(formData, zod4(broadcastSchema));
    if (!form.valid) return fail(400, { form });

    const recipientEmail = testEmailRaw || locals.user?.email || '';
    if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      return message(form, 'Email de test invalide.', { status: 400 });
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
      to: recipientEmail,
      subject,
      html: body,
    });

    if (!result.ok) {
      return message(form, `Échec : ${result.message}`, { status: 500 });
    }
    return message(form, `Test envoyé à ${recipientEmail}.`);
  },

  enqueue: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(broadcastSchema));
    if (!form.valid) return fail(400, { form });
    if (!locals.user) return fail(401, { form });

    // Auto-generate broadcast name: `[DD/MM/YYYY HH:MM] Campus - Template`.
    const [campus, template] = await Promise.all([
      prisma.campus.findUnique({
        where: { id: form.data.campusId },
        select: { name: true },
      }),
      prisma.messageTemplate.findUnique({
        where: { id: form.data.templateId },
        select: { name: true },
      }),
    ]);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const name = `[${stamp}] ${campus?.name ?? '?'} - ${template?.name ?? '?'}`;

    const { broadcastId } = await enqueueBroadcast({
      name,
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
