/**
 * The class A write on a transactional mail: which template it sends from.
 *
 * One action, one template, set or replaced. What makes this more than an
 * upsert is that a wrong link fails in silence at send time: a login mail with
 * no `{{otp_code}}` goes out and locks its reader out, and an unlinked action
 * sends nothing at all (`actionMail.ts`). So the write refuses a template that
 * lacks a variable the action cannot do without, and refuses to leave such an
 * action with no template. Re-pointing an action unlinks the previous template,
 * which may still carry a login code: `BROADCASTABLE_TEMPLATE_WHERE` keeps any
 * such template out of bulk sends on its own, so that is safe.
 *
 * Safe to repeat: it sets the link rather than toggling it.
 */

import { prisma } from '$lib/server/db';
import {
  EMAIL_ACTIONS,
  missingRequiredVariables,
  type EmailActionKey,
} from '$lib/domain/emailActions';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import type { WriteOutcome } from '../plan';

type LinkState = {
  action: EmailActionKey;
  template: { templateId: string; name: string } | null;
};

async function stateOf(action: EmailActionKey): Promise<LinkState> {
  const mapping = await prisma.emailActionMapping.findUnique({
    where: { actionKey: action },
    select: { template: { select: { id: true, name: true } } },
  });
  return {
    action,
    template: mapping
      ? { templateId: mapping.template.id, name: mapping.template.name }
      : null,
  };
}

export async function writeEmailAction(params: {
  emailAction: EmailActionKey;
  messageTemplateId: string | null;
}): Promise<WriteOutcome> {
  const action = EMAIL_ACTIONS[params.emailAction];
  const before = await stateOf(params.emailAction);

  if (params.messageTemplateId === null) {
    if (action.requiredVariables.length > 0) {
      throw new OperationRefusedError(
        `« ${action.label} » ne peut pas rester sans modèle : ce mail ne partirait plus, sans erreur visible. Liez-lui un autre modèle à la place.`,
      );
    }
    await prisma.emailActionMapping.deleteMany({
      where: { actionKey: params.emailAction },
    });
    return {
      applied: true,
      before,
      after: await stateOf(params.emailAction),
    };
  }

  const template = await prisma.messageTemplate.findUnique({
    where: { id: params.messageTemplateId },
    select: { id: true, name: true, channel: true, subject: true, body: true },
  });
  if (!template) {
    throw new OperationRefusedError(
      `Modèle « ${params.messageTemplateId} » introuvable. ${handleProvenanceFr('messageTemplateId')}`,
    );
  }
  if (template.channel !== 'mail') {
    throw new OperationRefusedError(
      `« ${template.name} » est un modèle de SMS : un mail transactionnel part d'un modèle de mail.`,
    );
  }
  const missing = missingRequiredVariables(params.emailAction, template);
  if (missing.length > 0) {
    throw new OperationRefusedError(
      `« ${template.name} » ne cite pas ${missing.map((v) => `{{${v}}}`).join(', ')}, sans quoi « ${action.label} » manque son but. Ajoutez-le au modèle, puis liez-le.`,
    );
  }

  await prisma.emailActionMapping.upsert({
    where: { actionKey: params.emailAction },
    create: { actionKey: params.emailAction, templateId: template.id },
    update: { templateId: template.id },
  });
  return { applied: true, before, after: await stateOf(params.emailAction) };
}
