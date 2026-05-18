/**
 * Server-side helper: resolve the admin-bound MessageTemplate for a
 * relance action and return its `{subject, body}` for the compose dialog.
 *
 * When no template is mapped, returns empty strings — the dialog shows
 * the "non configuré" banner, the send button is disabled, and staff
 * can't accidentally compose-then-have-it-silently-dropped. We used to
 * fall back to `defaultRelanceFor()` here but it was misleading: the
 * dialog was pre-filled with content that would never be sent.
 */

import { prisma } from '$lib/server/db';
import type { RelanceType } from '$lib/domain/relance';
import type { RelanceTemplate } from '$lib/domain/relanceTemplates';

export interface RelanceDefaultsResult {
  template: RelanceTemplate;
  hasMapping: boolean;
}

export async function loadRelanceDefaults(
  type: RelanceType,
): Promise<RelanceDefaultsResult> {
  const actionKey = type === 'student' ? 'relance_student' : 'relance_parent';
  const mapping = await prisma.emailActionMapping.findUnique({
    where: { actionKey },
    select: {
      template: { select: { subject: true, body: true } },
    },
  });
  if (mapping) {
    return {
      template: {
        subject: mapping.template.subject ?? '',
        body: mapping.template.body,
      },
      hasMapping: true,
    };
  }
  return {
    template: { subject: '', body: '' },
    hasMapping: false,
  };
}

export async function loadAllRelanceDefaults(): Promise<{
  student: RelanceDefaultsResult;
  parent: RelanceDefaultsResult;
}> {
  const [student, parent] = await Promise.all([
    loadRelanceDefaults('student'),
    loadRelanceDefaults('parent'),
  ]);
  return { student, parent };
}
