import type { RequestHandler } from './$types';
import {
  listReconciliationConflicts,
  type ConflictField,
} from '$lib/server/services/reconciliationService';

const FIELD_LABELS: Record<ConflictField, string> = {
  nom: 'Nom',
  prenom: 'Prénom',
  phone: 'Téléphone',
  civilite: 'Civilité',
  school: 'Lycée',
};

function csvCell(value: string | null): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`;
}

// One row per (talent, conflicting field): the actionable unit for whoever
// pushes the corrections back into Salesforce.
export const GET: RequestHandler = async () => {
  const conflicts = await listReconciliationConflicts();

  const lines = [
    [
      'externalId',
      'nom',
      'prenom',
      'email',
      'champ',
      'valeur_jump',
      'valeur_salesforce',
    ].join(','),
  ];
  for (const t of conflicts) {
    for (const c of t.conflicts) {
      lines.push(
        [
          csvCell(t.externalId),
          csvCell(t.nom),
          csvCell(t.prenom),
          csvCell(t.email),
          csvCell(FIELD_LABELS[c.field]),
          csvCell(c.jump),
          csvCell(c.sf),
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
      'Content-Disposition': `attachment; filename="conflits-salesforce-${date}.csv"`,
    },
  });
};
