/**
 * Thin client over the official Éducation nationale "Annuaire de l'éducation"
 * open dataset (~69k établissements, keyed by national UAI/RNE code).
 *
 * Two access shapes:
 *   - `searchAnnuaire(q)`: type-ahead by name/city, used by the onboarding lycée
 *     picker (`/api/lycees`).
 *   - `fetchSchoolByUai(uai)`: exact lookup by UAI, used to lazily enrich a
 *     canonical `School` row the first time a UAI is seen (Salesforce sync or a
 *     talent picking from the list).
 *
 * The dataset is the canonical source for school ↔ commune, so we never store
 * the city as free text: a UAI resolves to name + commune + postal/INSEE here.
 */

const API_URL =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records';

// Both lookups sit in a latency-sensitive path: the type-ahead picker and, via
// the school resolver, the onboarding submit and the worker sync. Cap the wait
// so an unresponsive gov API degrades to the fallback (the catch blocks below)
// instead of holding the request open for undici's multi-minute default.
const ANNUAIRE_TIMEOUT_MS = 5000;

export interface AnnuaireLycee {
  uai: string;
  nom: string;
  ville: string;
}

export interface AnnuaireSchool {
  uai: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  inseeCode: string | null;
}

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Type-ahead search over lycées by establishment name or commune. */
export async function searchAnnuaire(q: string): Promise<AnnuaireLycee[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  if (query.length > 100) return [];

  const escaped = query.replace(/'/g, "''");
  try {
    const params = new URLSearchParams({
      limit: '20',
      select: 'identifiant_de_l_etablissement,nom_etablissement,nom_commune',
      where: `type_etablissement="Lycée" AND (search(nom_etablissement, '${escaped}') OR search(nom_commune, '${escaped}'))`,
      order_by: 'nom_etablissement',
    });

    const res = await fetch(`${API_URL}?${params}`, {
      signal: AbortSignal.timeout(ANNUAIRE_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.results ?? [])
      .map(
        (r: {
          identifiant_de_l_etablissement?: string;
          nom_etablissement: string;
          nom_commune?: string;
        }): AnnuaireLycee => ({
          uai: r.identifiant_de_l_etablissement ?? '',
          nom: r.nom_etablissement,
          ville: r.nom_commune ?? '',
        }),
      )
      .filter(
        (lycee: AnnuaireLycee) =>
          !normalize(lycee.nom).startsWith("section d'enseignement"),
      )
      .slice(0, 10);
  } catch {
    return [];
  }
}

/** Exact lookup of a single establishment by its UAI. Null if unknown/unreachable. */
export async function fetchSchoolByUai(
  uai: string,
): Promise<AnnuaireSchool | null> {
  const code = uai.trim();
  if (!code) return null;
  if (!/^[0-9]{7}[A-Z]$/.test(code)) return null;

  const escaped = code.replace(/"/g, '""');
  try {
    const params = new URLSearchParams({
      limit: '1',
      select:
        'identifiant_de_l_etablissement,nom_etablissement,nom_commune,code_postal,code_commune',
      where: `identifiant_de_l_etablissement="${escaped}"`,
    });

    const res = await fetch(`${API_URL}?${params}`, {
      signal: AbortSignal.timeout(ANNUAIRE_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const r = data.results?.[0] as
      | {
          identifiant_de_l_etablissement?: string;
          nom_etablissement?: string;
          nom_commune?: string;
          code_postal?: string;
          code_commune?: string;
        }
      | undefined;
    if (!r?.nom_etablissement) return null;

    return {
      uai: r.identifiant_de_l_etablissement ?? code,
      name: r.nom_etablissement,
      city: r.nom_commune ?? null,
      postalCode: r.code_postal ?? null,
      inseeCode: r.code_commune ?? null,
    };
  } catch {
    return null;
  }
}
