import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import {
  listSalesforceDiffs,
  listSalesforceEnrichment,
  adoptSalesforceField,
  isDiffField,
} from '$lib/server/services/reconciliationService';

export const load: PageServerLoad = async () => {
  // Diffs are actionable (Salesforce disagrees / lacks a mirrored field);
  // enrichment is data Salesforce has no column for at all (parent contacts).
  // Both ride the CSV, so the page surfaces both — the page must show whatever
  // the export will contain, or the CSV holds rows the reviewer never saw.
  const [diffs, enrichment] = await Promise.all([
    listSalesforceDiffs(),
    listSalesforceEnrichment(),
  ]);
  // The page is purely presentational: it splits these two domain lists into
  // the two workflows it shows (conflicts to arbitrate vs. data to push to SF)
  // and derives every count from them, so the load returns the lists raw.
  return { diffs, enrichment };
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
  // The only manual resolution: decide Salesforce is right and overwrite the
  // talent's value with the SF claim. Jump winning is the default (no action) —
  // the diff stays listed, and in the CSV export, until Salesforce carries the
  // value and the next sync clears it. Only offered for a `conflict` (SF has a
  // value to adopt; a `missing` field has nothing).
  adoptSf: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);
    const target = readTarget(await request.formData());
    if (!target) return fail(400);
    await adoptSalesforceField(target.talentId, target.field);
    return { success: true };
  },
};
