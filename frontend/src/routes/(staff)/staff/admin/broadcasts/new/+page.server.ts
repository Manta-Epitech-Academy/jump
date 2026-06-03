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
import { sendTestMessage } from '$lib/server/services/broadcast/testMessage';
import {
  BROADCASTABLE_TEMPLATE_WHERE,
  loadBroadcastTemplate,
} from '$lib/server/services/broadcast/templates';
import { isSmsEnabled } from '$lib/server/sms';
import { SMS_BROADCAST_MAX_CHARS, estimateSmsLength } from '$lib/domain/sms';

export const load: PageServerLoad = async ({ url, locals }) => {
  const templateIdParam = url.searchParams.get('template') ?? undefined;

  const [templates, campuses] = await Promise.all([
    prisma.messageTemplate.findMany({
      // Only broadcast-purposed templates (see BROADCASTABLE_TEMPLATE_WHERE).
      // Transactional ones stay editable via the templates list (email-actions
      // links to manage them), just not pickable here; the send paths enforce
      // the same rule so hiding the option is not the only line of defence.
      where: BROADCASTABLE_TEMPLATE_WHERE,
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
      subject: '',
      body: '',
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

    const template = await loadBroadcastTemplate(form.data.templateId);
    if (!template) {
      return message(
        form,
        { type: 'error', text: 'Template introuvable ou non diffusable.' },
        { status: 400 },
      );
    }

    const event = form.data.eventId
      ? await prisma.event.findUnique({
          where: { id: form.data.eventId },
          select: { titre: true },
        })
      : null;

    // Test the *edited* content the composer shows, falling back to the
    // template's own when a field is left untouched/empty.
    const body = form.data.body?.trim() || template.body;
    const subject =
      template.channel === 'mail'
        ? form.data.subject?.trim() || template.subject
        : template.subject;

    // Pick the recipient field by channel; mail falls back to the sender's
    // own address. `sendTestMessage` bypasses the dev-redirect trap, so this
    // reaches the typed address even on dev/staging — that's the point of a
    // test-send (the bulk `enqueue` path below stays trapped).
    const to =
      template.channel === 'sms'
        ? ((formData.get('testPhone') as string | null)?.trim() ?? '')
        : (formData.get('testEmail') as string | null)?.trim() ||
          locals.user?.email ||
          '';

    const result = await sendTestMessage({
      channel: template.channel,
      subject,
      body,
      to,
      eventName: event?.titre,
    });
    if (!result.ok) {
      return message(
        form,
        { type: 'error', text: `Échec : ${result.message}` },
        { status: 400 },
      );
    }
    return message(form, {
      type: 'success',
      text:
        template.channel === 'sms'
          ? `Test SMS envoyé à ${to}.`
          : `Test envoyé à ${to}.`,
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

    // Resolve the template through the broadcastable guard so a transactional
    // id (e.g. a `?template=` deep link the picker would have hidden) surfaces a
    // clean form error here rather than throwing in `enqueueBroadcast`. The
    // template also fixes the channel for content validation below.
    const [campus, template] = await Promise.all([
      prisma.campus.findUnique({
        where: { id: campusId },
        select: { name: true },
      }),
      loadBroadcastTemplate(templateId),
    ]);
    if (!template) {
      return message(
        form,
        { type: 'error', text: 'Template introuvable ou non diffusable.' },
        { status: 400 },
      );
    }

    // Validate the per-send content (seeded from the template, editable here).
    const body = form.data.body?.trim() ?? '';
    const subject = form.data.subject?.trim() ?? '';
    if (!body) setError(form, 'body', 'Le message ne peut pas être vide');
    if (template.channel === 'mail' && !subject) {
      setError(form, 'subject', 'Le sujet est obligatoire pour un mail');
    }
    if (
      template.channel === 'sms' &&
      estimateSmsLength(body) > SMS_BROADCAST_MAX_CHARS
    ) {
      setError(form, 'body', 'Message SMS trop long — raccourcissez le texte');
    }
    if (
      (form.errors.body?.length ?? 0) > 0 ||
      (form.errors.subject?.length ?? 0) > 0
    ) {
      return fail(400, { form });
    }

    // Auto-generate broadcast name: `[DD/MM/YYYY HH:MM] Campus - Template`.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const name = `[${stamp}] ${campus?.name ?? '?'} - ${template.name}`;

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
      // Snapshot the composer's edited content for this send only.
      bodyOverride: body,
      subjectOverride: template.channel === 'mail' ? subject : null,
    });

    // Process inline (fire-and-forget). For larger volumes, route to a worker.
    processBroadcast(broadcastId).catch((err) => {
      // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
      console.error(`[broadcast ${broadcastId}] processing failed`, err);
    });

    redirect(303, `/staff/admin/broadcasts/${broadcastId}`);
  },
};
