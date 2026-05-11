/**
 * Default relance templates. Loaded fresh into the compose dialog on each
 * open — no persistence. Edits stay local to the send.
 *
 * The brand frame (greeting + CTA + signature) is rendered around the body
 * automatically — do NOT prefix the body with "Salut …" / "Bonjour …",
 * the greeting is generated server-side per recipient.
 *
 * Variables (rendered per recipient via applyPlaceholders):
 *   student → {{prenom}}, {{nom}}
 *   parent  → {{prenomParent}}, {{nomParent}}, {{childName}}
 */

import type { RelanceType } from '$lib/domain/relance';

export type RelanceTemplate = {
  subject: string;
  body: string;
};

export const STUDENT_RELANCE_DEFAULT: RelanceTemplate = {
  subject: 'Finalise ton inscription sur Jump',
  body: `Ton inscription sur Jump n'est pas encore terminée. Il ne te reste que quelques étapes pour accéder à ton espace.`,
};

export const PARENT_RELANCE_DEFAULT: RelanceTemplate = {
  subject: "Rappel : signez le droit à l'image de {{childName}}",
  body: `Nous n'avons pas encore reçu votre autorisation pour le droit à l'image de {{childName}} dans le cadre de son stage Epitech Academy.

Cette signature est nécessaire avant le début du stage et ne prend qu'une minute.`,
};

export function defaultRelanceFor(type: RelanceType): RelanceTemplate {
  return type === 'student' ? STUDENT_RELANCE_DEFAULT : PARENT_RELANCE_DEFAULT;
}
