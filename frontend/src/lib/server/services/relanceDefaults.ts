/**
 * Server-side helper: resolve the admin-bound MessageTemplate for a
 * relance action and return its `{subject, body}` for the compose dialog.
 *
 * When no template is mapped, falls back to the hardcoded
 * `defaultRelanceFor()` so staff still see *something* in the dialog —
 * but `sendRelances` will refuse to send (returns `noTemplate` skip).
 * Pair with a UI hint surfaced from the same `hasMapping` flag.
 */

import { prisma } from '$lib/server/db';
import type { RelanceType } from '$lib/domain/relance';
import {
  defaultRelanceFor,
  type RelanceTemplate,
} from '$lib/domain/relanceTemplates';

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
  return { template: defaultRelanceFor(type), hasMapping: false };
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
