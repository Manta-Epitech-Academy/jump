import { prisma } from '$lib/server/db';

/**
 * Resolves theme names to official (global) theme IDs, creating missing ones.
 */
export async function processOfficialThemes(themeNames: string[]): Promise<string[]> {
	const names = themeNames.map((n) => n.trim()).filter(Boolean);
	if (names.length === 0) return [];

	const existing = await prisma.theme.findMany({
		where: { nom: { in: names }, campusId: null },
	});

	const existingNames = new Set(existing.map((t) => t.nom));
	const toCreate = names.filter((n) => !existingNames.has(n));

	if (toCreate.length > 0) {
		await prisma.theme.createMany({
			data: toCreate.map((nom) => ({ nom, campusId: null })),
			skipDuplicates: true,
		});
	}

	const all = await prisma.theme.findMany({
		where: { nom: { in: names }, campusId: null },
	});

	return all.map((t) => t.id);
}
