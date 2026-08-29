import type { DiffField } from '$lib/domain/reconciliation';
import type { AuthConflict } from '$lib/domain/authIdentity';

// Structural mirrors of the reconciliation service's return shapes, declared
// here (not imported from `$lib/server/services/reconciliationService`) so this
// client-consumed file never pulls a server module into the browser bundle. The
// load's actual return is checked against these by assignment; `AuthConflict`
// already lives in the client-safe `$lib/domain/authIdentity`.
export type DiffKind = 'conflict' | 'missing';

export type FieldDiff = {
  field: DiffField;
  kind: DiffKind;
  jump: string | null;
  sf: string | null;
  jumpKey?: string | null;
  sfKey?: string | null;
};

export type TalentDiff = {
  talentId: string;
  externalId: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  diffs: FieldDiff[];
  /** Most recent confirmation instant (ISO); only used to window the export. */
  confirmedAt: string;
};

export type TalentEnrichment = {
  talentId: string;
  externalId: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  fields: { label: string; value: string }[];
  /** Most recent confirmation instant (ISO); only used to window the export. */
  confirmedAt: string;
};

/** The payload streamed behind the page shell's resolve: three full-cohort
 *  reconciliation scans. Shared by the load and `SfConflictsResults` so the
 *  streamed shape and the consuming component can never drift. */
export type SfConflictsData = {
  diffs: TalentDiff[];
  enrichment: TalentEnrichment[];
  authConflicts: AuthConflict[];
};
