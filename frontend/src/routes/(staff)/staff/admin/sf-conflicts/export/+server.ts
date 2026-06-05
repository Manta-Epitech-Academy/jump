import type { RequestHandler } from './$types';
import {
  listSalesforceDiffs,
  listSalesforceEnrichment,
} from '$lib/server/services/reconciliationService';
import { FIELD_LABELS } from '$lib/domain/reconciliation';
import { csvResponse } from '$lib/server/csv';

// One row per (talent, field): the actionable unit for whoever pushes the data
// back into Salesforce. `type` separates a real divergence (SF disagrees) from
// data SF simply doesn't hold — both differing fields and the parent contacts
// Salesforce has no column for.
//
// The `uai_*` columns carry the lycée's UAI alongside its name: a school's name
// is fuzzy and non-unique, so Salesforce can only be matched on the exact UAI.
// Only `school` rows populate them (every other field is a scalar that already
// matches on its own value); they stay empty everywhere else.
export const GET: RequestHandler = async () => {
  const [diffs, enrichment] = await Promise.all([
    listSalesforceDiffs(),
    listSalesforceEnrichment(),
  ]);

  const rows: (string | null)[][] = [];
  for (const t of diffs) {
    for (const d of t.diffs) {
      rows.push([
        t.externalId,
        t.nom,
        t.prenom,
        t.email,
        d.kind === 'conflict' ? 'Divergence' : 'Absent de Salesforce',
        FIELD_LABELS[d.field],
        d.jump,
        d.jumpKey ?? null,
        d.sf,
        d.sfKey ?? null,
      ]);
    }
  }
  for (const t of enrichment) {
    for (const f of t.fields) {
      rows.push([
        t.externalId,
        t.nom,
        t.prenom,
        t.email,
        'Absent de Salesforce',
        f.label,
        f.value,
        null,
        null,
        null,
      ]);
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(
    `divergences-salesforce-${date}.csv`,
    [
      'externalId',
      'nom',
      'prenom',
      'email',
      'type',
      'champ',
      'valeur_jump',
      'uai_jump',
      'valeur_salesforce',
      'uai_salesforce',
    ],
    rows,
  );
};
