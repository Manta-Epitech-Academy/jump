import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message, setError } from 'sveltekit-superforms';
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
import { sendSms, isSmsEnabled } from '$lib/server/sms';
import { toBrevoRecipient } from '$lib/domain/phone';
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
      templateId: templateIdParam ?? '',
      campusId: '',
      audience: undefined,
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
    smsEnabled: isSmsEnabled(),
  };
};

export const actions: Actions = {
  testSend: async ({ request, locals }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(broadcastSchema));
    if (!form.valid) return fail(400, { form });

    const template = await prisma.messageTemplate.findUnique({
      where: { id: form.data.templateId },
      select: { channel: true, subject: true, body: true },
    });
    if (!template) {
      return message(
        form,
        { type: 'error', text: 'Template introuvable.' },
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

    // SMS test: normalize the test number the same way real recipients are,
    // render the body with demo vars (links tracked exactly like a real send),
    // and ship it through the shared SMS façade. SMS_DEV_RECIPIENTS still
    // applies, so a configured dev env reroutes the test too.
    if (template.channel === 'sms') {
      const testPhoneRaw = (formData.get('testPhone') as string | null)?.trim();
      const recipient = toBrevoRecipient(testPhoneRaw);
      if (!recipient) {
        return message(
          form,
          { type: 'error', text: 'Numéro de test invalide.' },
          { status: 400 },
        );
      }
      const body = rewriteSmsLinks(
        substituteVariables(template.body, ctx),
        'TEST_TRACKING_ID',
      );
      const result = await sendSms({ to: recipient, body });
      if (!result.ok) {
        return message(
          form,
          { type: 'error', text: `Échec : ${result.message}` },
          { status: 500 },
        );
      }
      return message(form, {
        type: 'success',
        text: `Test SMS envoyé à ${testPhoneRaw}.`,
      });
    }

    // Mail test.
    const testEmailRaw = (formData.get('testEmail') as string | null)?.trim();
    const recipientEmail = testEmailRaw || locals.user?.email || '';
    if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      return message(
        form,
        { type: 'error', text: 'Email de test invalide.' },
        { status: 400 },
      );
    }
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
      return message(
        form,
        { type: 'error', text: `Échec : ${result.message}` },
        { status: 500 },
      );
    }
    return message(form, {
      type: 'success',
      text: `Test envoyé à ${recipientEmail}.`,
    });
  },

  enqueue: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(broadcastSchema));
    if (!form.valid) return fail(400, { form });
    if (!locals.user) return fail(401, { form });

    // campusId + audience are required to enqueue (but not for test-send or
    // the live preview), so the requirement is enforced here rather than in
    // the shared schema.
    const { campusId, audience, templateId } = form.data;
    if (!campusId) setError(form, 'campusId', 'Sélectionne un campus');
    if (!audience) setError(form, 'audience', 'Sélectionne une audience');
    if (!campusId || !audience) return fail(400, { form });

    // Auto-generate broadcast name: `[DD/MM/YYYY HH:MM] Campus - Template`.
    const [campus, template] = await Promise.all([
      prisma.campus.findUnique({
        where: { id: campusId },
        select: { name: true },
      }),
      prisma.messageTemplate.findUnique({
        where: { id: templateId },
        select: { name: true },
      }),
    ]);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const name = `[${stamp}] ${campus?.name ?? '?'} - ${template?.name ?? '?'}`;

    const { broadcastId } = await enqueueBroadcast({
      name,
      templateId,
      campusId,
      audience,
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
