import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import {
  listReconciliationConflicts,
  acceptJumpField,
  adoptSalesforceField,
  isConflictField,
} from '$lib/server/services/reconciliationService';

export const load: PageServerLoad = async () => {
  const conflicts = await listReconciliationConflicts();
  return {
    conflicts,
    totalTalents: conflicts.length,
    totalFields: conflicts.reduce((n, c) => n + c.conflicts.length, 0),
  };
};

// Resolution is per (talent, field): a single conflict row, never the whole
// talent. Both actions read the same `talentId` + `field` pair off the form.
function readTarget(data: FormData) {
  const talentId = data.get('talentId');
  const field = data.get('field');
  if (typeof talentId !== 'string' || !talentId) return null;
  if (!isConflictField(field)) return null;
  return { talentId, field };
}

export const actions: Actions = {
  // Keep the talent-confirmed value for this field; realign the SF mirror so the
  // conflict clears (the value is pushed to Salesforce by hand, via the CSV
  // export, before or after).
  acceptJump: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);
    const target = readTarget(await request.formData());
    if (!target) return fail(400);
    await acceptJumpField(target.talentId, target.field);
    return { success: true };
  },

  // Side with Salesforce for this field: overwrite the talent's value with the
  // SF claim.
  adoptSf: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);
    const target = readTarget(await request.formData());
    if (!target) return fail(400);
    await adoptSalesforceField(target.talentId, target.field);
    return { success: true };
  },
};
