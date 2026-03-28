export const DIFFICULTY_XP: Record<string, number> = {
  Débutant: 20,
  Intermédiaire: 45,
  Avancé: 75,
};

/**
 * Calculates how much XP a subject is worth based on its difficulty.
 */
export function getSubjectXpValue(difficulte: string): number {
  return DIFFICULTY_XP[difficulte] || 20;
}

/**
 * Calculates total XP for a list of subjects.
 */
export function getTotalXp(subjects: any[]): number {
  if (!subjects || subjects.length === 0) return 20; // Default attendance XP if no subject
  return subjects.reduce(
    (total, sub) => total + getSubjectXpValue(sub.difficulte),
    0,
  );
}
