import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

const API_URL =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records';

type Lycee = { nom: string; ville: string };

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

let lyceeCache: Lycee[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

async function loadAllLycees(): Promise<Lycee[]> {
  if (lyceeCache && Date.now() - cacheLoadedAt < CACHE_TTL) return lyceeCache;

  const all: Lycee[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      select: 'nom_etablissement,nom_commune',
      where: 'type_etablissement="Lycée"',
      order_by: 'nom_etablissement',
    });

    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) break;

    const data = await res.json();
    const results = data.results ?? [];
    for (const r of results) {
      all.push({
        nom: r.nom_etablissement,
        ville: r.nom_commune ?? '',
      });
    }

    if (results.length < limit) break;
    offset += limit;
  }

  lyceeCache = all;
  cacheLoadedAt = Date.now();
  return all;
}

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json([]);

  try {
    const all = await loadAllLycees();
    const query = normalize(q);

    const results = all
      .filter(
        (lycee) =>
          (normalize(lycee.nom).includes(query) ||
            normalize(lycee.ville).includes(query)) &&
          !lycee.nom.toLowerCase().startsWith("section d'enseignement"),
      )
      .slice(0, 10);

    return json(results);
  } catch {
    return json([]);
  }
};
