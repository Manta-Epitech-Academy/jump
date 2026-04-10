import { z } from 'zod';
import { difficultes } from './subjects';

export { difficultes };

export const activityTypes = ['atelier', 'conference', 'quiz', 'orga', 'special'] as const;

export const activityTypeLabels: Record<(typeof activityTypes)[number], string> = {
	atelier: 'Atelier',
	conference: 'Conférence',
	quiz: 'Quiz',
	orga: 'Organisation',
	special: 'Spécial',
};

export const templateSchema = z
	.object({
		nom: z
			.string()
			.min(3, 'Le nom doit faire au moins 3 caractères')
			.max(100, 'Le nom ne peut pas dépasser 100 caractères'),
		description: z.string().optional().or(z.literal('')),
		difficulte: z
			.enum(difficultes, {
				message: 'Veuillez sélectionner une difficulté valide',
			})
			.default('Débutant'),
		activityType: z.enum(activityTypes, {
			message: "Veuillez sélectionner un type d'activité",
		}),
		isDynamic: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(false)),
		defaultDuration: z.preprocess(
			(val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
			z
				.number({ message: 'La durée doit être un nombre' })
				.int('La durée doit être un nombre entier')
				.positive('La durée doit être positive')
				.optional(),
		),
		link: z
			.url("Le format du lien n'est pas valide (https://...)")
			.optional()
			.or(z.literal('')),
		themes: z.array(z.string()).default([]),
		content: z.string().optional().or(z.literal('')),
		contentStructure: z
			.string()
			.optional()
			.or(z.literal(''))
			.refine(
				(val) => {
					if (!val) return true;
					try {
						JSON.parse(val);
						return true;
					} catch {
						return false;
					}
				},
				{ message: "Le JSON n'est pas valide" },
			),
	})
	.superRefine((data, ctx) => {
		if (data.isDynamic) {
			if (!data.contentStructure) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'La structure du contenu est requise pour une activité dynamique',
					path: ['contentStructure'],
				});
			}
			if (data.content) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Le contenu markdown ne doit pas être renseigné pour une activité dynamique',
					path: ['content'],
				});
			}
		} else {
			if (data.contentStructure) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'La structure JSON ne doit pas être renseignée pour une activité statique',
					path: ['contentStructure'],
				});
			}
		}
	});

export type TemplateForm = z.infer<typeof templateSchema>;
