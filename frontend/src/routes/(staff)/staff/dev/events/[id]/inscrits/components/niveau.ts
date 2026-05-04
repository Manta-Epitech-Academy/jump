const NIVEAU_LABELS: Record<string, string> = {
  '6eme': '6ème',
  '5eme': '5ème',
  '4eme': '4ème',
  '3eme': '3ème',
  '2nde': 'Seconde',
  '1ere': 'Première',
  Terminale: 'Terminale',
  Sup: 'Supérieur',
};

const NIVEAU_ORDER = Object.keys(NIVEAU_LABELS);

export function humanizeNiveau(niveau: string | null | undefined): string {
  if (!niveau) return '';
  return NIVEAU_LABELS[niveau] ?? niveau;
}

export function compareNiveaux(a: string, b: string): number {
  const ai = NIVEAU_ORDER.indexOf(a);
  const bi = NIVEAU_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b, 'fr');
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}
