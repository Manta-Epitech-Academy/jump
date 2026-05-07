import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

const API_URL =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json([]);

  try {
    const params = new URLSearchParams({
      limit: '10',
      select: 'nom_etablissement,nom_commune,code_postal_uai',
      where: 'type_etablissement="Lycée"',
      search: q,
    });

    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) return json([]);

    const data = await res.json();
    const results = (data.results ?? []).map((r: any) => ({
      nom: r.nom_etablissement,
      ville: r.nom_commune,
      codePostal: r.code_postal_uai ?? '',
    }));

    return json(results);
  } catch {
    return json([]);
  }
};
