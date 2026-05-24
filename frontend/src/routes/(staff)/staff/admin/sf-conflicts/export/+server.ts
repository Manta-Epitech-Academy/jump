import type { RequestHandler } from './$types';
import {
  listSalesforceDiffs,
  listSalesforceEnrichment,
} from '$lib/server/services/reconciliationService';
import { FIELD_LABELS } from '$lib/domain/reconciliation';

function csvCell(value: string | null): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`;
}

// One row per (talent, field): the actionable unit for whoever pushes the data
// back into Salesforce. `type` separates a real divergence (SF disagrees) from
// data SF simply doesn't hold — both differing fields and the parent contacts
// Salesforce has no column for.
export const GET: RequestHandler = async () => {
  const [diffs, enrichment] = await Promise.all([
    listSalesforceDiffs(),
    listSalesforceEnrichment(),
  ]);

  const lines = [
    [
      'externalId',
      'nom',
      'prenom',
      'email',
      'type',
      'champ',
      'valeur_jump',
      'valeur_salesforce',
    ].join(','),
  ];

  for (const t of diffs) {
    for (const d of t.diffs) {
      lines.push(
        [
          csvCell(t.externalId),
          csvCell(t.nom),
          csvCell(t.prenom),
          csvCell(t.email),
          csvCell(
            d.kind === 'conflict' ? 'Divergence' : 'Absent de Salesforce',
          ),
          csvCell(FIELD_LABELS[d.field]),
          csvCell(d.jump),
          csvCell(d.sf),
        ].join(','),
      );
    }
  }

  for (const t of enrichment) {
    for (const f of t.fields) {
      lines.push(
        [
          csvCell(t.externalId),
          csvCell(t.nom),
          csvCell(t.prenom),
          csvCell(t.email),
          csvCell('Absent de Salesforce'),
          csvCell(f.label),
          csvCell(f.value),
          csvCell(null),
        ].join(','),
      );
    }
  }

  // BOM + CRLF so Excel opens the accented French content correctly.
  const body = '﻿' + lines.join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="divergences-salesforce-${date}.csv"`,
    },
  });
};
