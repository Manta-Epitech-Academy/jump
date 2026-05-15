import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

const API_URL =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records';

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json([]);

  const escaped = q.replace(/'/g, "\\'");

  try {
    const params = new URLSearchParams({
      limit: '20',
      select: 'nom_etablissement,nom_commune',
      where: `type_etablissement="Lycée" AND (search(nom_etablissement, '${escaped}') OR search(nom_commune, '${escaped}'))`,
      order_by: 'nom_etablissement',
    });

    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) return json([]);

    const data = await res.json();
    const results = (data.results ?? [])
      .map((r: { nom_etablissement: string; nom_commune?: string }) => ({
        nom: r.nom_etablissement,
        ville: r.nom_commune ?? '',
      }))
      .filter(
        (lycee: { nom: string }) =>
          !normalize(lycee.nom).startsWith("section d'enseignement"),
      )
      .slice(0, 10);

    return json(results);
  } catch {
    return json([]);
  }
};
