import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  listSalesforceDiffs,
  listSalesforceEnrichment,
  recordSfExport,
} from '$lib/server/services/reconciliationService';
import { FIELD_LABELS } from '$lib/domain/reconciliation';
import { csvResponse } from '$lib/server/csv';

// One row per (talent, field): the actionable unit for whoever pushes the data
// back into Salesforce. `type` separates a real divergence (SF disagrees) from
// data SF simply doesn't hold — differing fields, the parent contacts Salesforce
// has no column for, and the talent's centres d'intérêt.
//
// The `uai_*` columns carry the lycée's UAI alongside its name: a school's name
// is fuzzy and non-unique, so Salesforce can only be matched on the exact UAI.
// Only `school` rows populate them (every other field is a scalar that already
// matches on its own value); they stay empty everywhere else.
//
// The export is optionally windowed by *when the talent confirmed* (the menu's
// period presets / custom range / "depuis le dernier export"): `from`/`to` are
// full ISO instants, and a talent is kept when the most recent of their
// confirmation timestamps falls inside the window. Scoping the artifact, not the
// page — the page still lists every conflict. The unscoped "Tout" export stays
// authoritative and is the only one that advances the admin's high-water mark.
function parseInstant(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

// Date suffix that makes the downloaded file self-documenting: the window when a
// range is set, otherwise the export date.
function fileDateSuffix(
  from: Date | undefined,
  to: Date | undefined,
  exportDate: string,
): string {
  if (from && to) return `${ymd(from)}_${ymd(to)}`;
  if (from) return `depuis-${ymd(from)}`;
  if (to) return `jusquau-${ymd(to)}`;
  return exportDate;
}

export const GET: RequestHandler = async ({ locals, url }) => {
  // The /staff/admin layout already redirects non-admins; this is defence in
  // depth for an endpoint that streams minors' personal data.
  const staffProfile = locals.staffProfile;
  if (staffProfile?.staffRole !== 'admin') throw error(403, 'Accès refusé');

  const from = parseInstant(url.searchParams.get('from'));
  const to = parseInstant(url.searchParams.get('to'));

  // Whether this download advances the admin's export high-water mark. Only a
  // full, open-ended export ("everything up to now") may: no upper time bound
  // (else it's a historical window, not "up to now"). The client sets `advance`
  // only on the all-time and "depuis le dernier export" downloads; this
  // structural check is the rail so a stray flag on a scoped link can't corrupt
  // the mark.
  const advanceMark = url.searchParams.get('advance') === '1' && !to;

  // One clock for the request. The mark, when advanced, is set to this
  // pre-snapshot instant so a talent confirming mid-export is re-offered next
  // time rather than skipped.
  const exportedAt = new Date();

  const [diffs, enrichment] = await Promise.all([
    listSalesforceDiffs(),
    listSalesforceEnrichment(),
  ]);

  // One window decision per talent, on the most recent of their confirmation
  // instants across both lists (ISO instants compare lexicographically =
  // chronologically). Matches the menu's dedup-by-max count so the "(N talents)"
  // it shows equals what the CSV carries.
  const confirmedAt = new Map<string, string>();
  const bump = (id: string, iso: string) => {
    const cur = confirmedAt.get(id);
    if (!cur || iso > cur) confirmedAt.set(id, iso);
  };
  for (const t of diffs) bump(t.talentId, t.confirmedAt);
  for (const t of enrichment) bump(t.talentId, t.confirmedAt);

  const inWindow = (talentId: string): boolean => {
    const iso = confirmedAt.get(talentId);
    if (!iso) return false;
    const at = new Date(iso).getTime();
    if (from && at < from.getTime()) return false;
    if (to && at > to.getTime()) return false;
    return true;
  };

  const rows: (string | null)[][] = [];
  for (const t of diffs) {
    if (!inWindow(t.talentId)) continue;
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
    if (!inWindow(t.talentId)) continue;
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

  // Record the high-water pass only once we know the artifact is being built,
  // and only for a full open-ended export (see `advanceMark`). Fire-and-forget;
  // a failed write safely re-offers next time.
  if (advanceMark) {
    void recordSfExport(staffProfile.id, exportedAt).catch((err) =>
      console.error('[sf-conflicts-export] mark export failed', err),
    );
  }

  return csvResponse(
    `divergences-salesforce-${fileDateSuffix(from, to, ymd(exportedAt))}.csv`,
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
