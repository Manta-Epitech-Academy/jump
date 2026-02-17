export const LEVEL_XP: Record<string, number> = {
	'6eme': 10,
	'5eme': 15,
	'4eme': 20,
	'3eme': 25,
	'2nde': 35,
	'1ere': 45,
	Terminale: 55,
	Sup: 70
};

/**
 * Calculates how much XP a subject is worth based on its targeted levels.
 * Returns the highest value among targeted levels.
 */
export function getSubjectXpValue(niveaux: string[] | any): number {
	const levels = (niveaux as string[]) || [];
	if (levels.length === 0) return 10;
	const xpGains = levels.map((lvl) => LEVEL_XP[lvl] || 10);
	return Math.max(...xpGains);
}

/**
 * Calculates total XP for a list of subjects.
 */
export function getTotalXp(subjects: any[]): number {
	if (!subjects || subjects.length === 0) return 20; // Default attendance XP if no subject
	return subjects.reduce((total, sub) => total + getSubjectXpValue(sub.niveaux), 0);
}
