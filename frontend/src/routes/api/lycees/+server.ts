import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

const API_URL =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records';

type Lycee = { nom: string; ville: string; codePostal: string };

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
      select: 'nom_etablissement,nom_commune,code_postal',
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
        codePostal: r.code_postal ?? '',
      });
    }

    if (results.length < limit) break;
    offset += limit;
  }

  lyceeCache = all;
  cacheLoadedAt = Date.now();
  return all;
}

/**
 * Simple fuzzy score: how well does the query match the target?
 * Returns 0 (no match) to 1 (perfect match).
 * Tolerates character skips (typos, missing letters).
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t.includes(q)) return 0.9 + (q.length / t.length) * 0.1;

  let qi = 0;
  let matched = 0;
  let lastMatchPos = -1;
  let consecutiveBonus = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matched++;
      if (lastMatchPos === ti - 1) consecutiveBonus += 0.1;
      lastMatchPos = ti;
      qi++;
    }
  }

  if (matched < q.length * 0.6) return 0;

  const matchRatio = matched / q.length;
  const lengthPenalty = Math.min(1, q.length / t.length);
  return (
    matchRatio * 0.7 + lengthPenalty * 0.2 + Math.min(consecutiveBonus, 0.1)
  );
}

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json([]);

  try {
    const all = await loadAllLycees();
    const query = q.toLowerCase();

    // Check if query looks like a postal code
    const isPostalCode = /^\d{2,5}$/.test(q);

    const scored = all
      .map((lycee) => {
        let score = 0;

        if (isPostalCode) {
          if (lycee.codePostal.startsWith(q)) score = 1;
          else return { lycee, score: 0 };
        } else {
          const nomScore = fuzzyScore(query, lycee.nom);
          const villeScore = fuzzyScore(query, lycee.ville);
          score = Math.max(nomScore, villeScore * 0.9);
        }

        return { lycee, score };
      })
      .filter((r) => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return json(scored.map((r) => r.lycee));
  } catch {
    return json([]);
  }
};
