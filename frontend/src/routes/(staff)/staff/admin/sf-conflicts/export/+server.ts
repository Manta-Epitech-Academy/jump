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
        d.sf,
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
      'valeur_salesforce',
    ],
    rows,
  );
};
