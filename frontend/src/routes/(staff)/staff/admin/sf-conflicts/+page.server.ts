import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import {
  listSalesforceDiffs,
  listSalesforceEnrichment,
  adoptSalesforceField,
  isDiffField,
} from '$lib/server/services/reconciliationService';
import { listAuthIdentityConflicts } from '$lib/server/services/authIdentityService';
import {
  runAuthRepair,
  type AuthRepairAction,
} from '$lib/server/services/authIdentityRepairService';

export const load: PageServerLoad = async () => {
  // Two families of conflict surfaced as two tabs on this page:
  //  - DATA  : Talent ⇆ TalentSfImport field diffs + enrichment to push (CSV).
  //  - AUTH  : Talent ⇆ bauth_user identity drift (login-layer), with per-verdict
  //            repairs. Calculated, never stored — same convention as the diffs.
  const [diffs, enrichment, authConflicts] = await Promise.all([
    listSalesforceDiffs(),
    listSalesforceEnrichment(),
    listAuthIdentityConflicts(),
  ]);
  return { diffs, enrichment, authConflicts };
};

// Resolution is per (talent, field): a single diff row, never the whole talent.
function readDiffTarget(data: FormData) {
  const talentId = data.get('talentId');
  const field = data.get('field');
  if (typeof talentId !== 'string' || !talentId) return null;
  if (!isDiffField(field)) return null;
  return { talentId, field };
}

const AUTH_ACTIONS: readonly AuthRepairAction[] = [
  'repointDrop',
  'rename',
  'swap',
  'sever',
];
function isAuthAction(v: unknown): v is AuthRepairAction {
  return (
    typeof v === 'string' && (AUTH_ACTIONS as readonly string[]).includes(v)
  );
}

export const actions: Actions = {
  // ── DATA tab: adopt Salesforce for one field (overwrite the talent value). ──
  adoptSf: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') return fail(403);
    const target = readDiffTarget(await request.formData());
    if (!target) return fail(400);
    await adoptSalesforceField(target.talentId, target.field);
    return { success: true };
  },

  // ── AUTH tab: run one identity repair (repoint+drop / rename / swap / sever).
  // The action name comes from the row's verdict (see actionForVerdict); the
  // core re-verifies the precondition inside its transaction and throws if the
  // state no longer matches, which we surface as a failed action.
  repairAuth: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin' || !locals.user)
      return fail(403);
    const data = await request.formData();
    const talentId = data.get('talentId');
    const action = data.get('action');
    if (typeof talentId !== 'string' || !talentId || !isAuthAction(action))
      return fail(400);
    try {
      await runAuthRepair(action, talentId, locals.user.id);
    } catch (err) {
      return fail(409, {
        message: err instanceof Error ? err.message : 'Échec de la résolution.',
      });
    }
    return { success: true };
  },
};
