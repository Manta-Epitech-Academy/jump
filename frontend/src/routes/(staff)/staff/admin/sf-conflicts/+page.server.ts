import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import {
  listSalesforceDiffs,
  acceptJumpField,
  adoptSalesforceField,
  isDiffField,
} from '$lib/server/services/reconciliationService';

export const load: PageServerLoad = async () => {
  const diffs = await listSalesforceDiffs();
  return {
    diffs,
    totalTalents: diffs.length,
    totalFields: diffs.reduce((n, d) => n + d.diffs.length, 0),
  };
};

// Resolution is per (talent, field): a single diff row, never the whole talent.
// Both actions read the same `talentId` + `field` pair off the form.
function readTarget(data: FormData) {
  const talentId = data.get('talentId');
  const field = data.get('field');
  if (typeof talentId !== 'string' || !talentId) return null;
  if (!isDiffField(field)) return null;
  return { talentId, field };
}

export const actions: Actions = {
  // Keep the talent-confirmed value for this field; realign the SF mirror so the
  // diff clears (the value is pushed to Salesforce by hand, via the CSV export,
  // before or after).
  acceptJump: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);
    const target = readTarget(await request.formData());
    if (!target) return fail(400);
    await acceptJumpField(target.talentId, target.field);
    return { success: true };
  },

  // Side with Salesforce for this field: overwrite the talent's value with the
  // SF claim. Only meaningful for a `conflict` (SF has a value to adopt).
  adoptSf: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);
    const target = readTarget(await request.formData());
    if (!target) return fail(400);
    await adoptSalesforceField(target.talentId, target.field);
    return { success: true };
  },
};
