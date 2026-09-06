import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  EMAIL_ACTIONS,
  EMAIL_ACTION_KEYS,
  type EmailActionKey,
} from '$lib/domain/emailActions';

export const load: PageServerLoad = async () => {
  const [templates, mappings] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { channel: 'mail' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.emailActionMapping.findMany({
      select: { actionKey: true, templateId: true, updatedAt: true },
    }),
  ]);

  const byKey = new Map(mappings.map((m) => [m.actionKey, m]));
  const rows = EMAIL_ACTION_KEYS.map((key) => ({
    action: EMAIL_ACTIONS[key],
    mapping: byKey.get(key) ?? null,
  }));

  return {
    rows,
    templates,
    missingCount: rows.filter((r) => !r.mapping).length,
  };
};

function isActionKey(s: string): s is EmailActionKey {
  return (EMAIL_ACTION_KEYS as readonly string[]).includes(s);
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_EMAIL_ACTIONS_SAVE, { locals });
    const form = await request.formData();
    const actionKey = String(form.get('actionKey') ?? '');
    const templateId = String(form.get('templateId') ?? '');

    if (!isActionKey(actionKey)) {
      return fail(400, { error: 'Action inconnue.' });
    }
    if (!templateId) {
      // Empty → clear the mapping (admin un-bound the action).
      await prisma.emailActionMapping
        .delete({ where: { actionKey } })
        .catch(() => {});
      return { ok: true };
    }

    const template = await prisma.messageTemplate.findUnique({
      where: { id: templateId },
      select: { channel: true },
    });
    if (!template || template.channel !== 'mail') {
      return fail(400, { error: 'Template introuvable ou non-mail.' });
    }

    await prisma.emailActionMapping.upsert({
      where: { actionKey },
      update: { templateId },
      create: { actionKey, templateId },
    });

    return { ok: true };
  },
};
