/**
 * Hardcoded fallback content used to seed the compose dialog when the
 * admin hasn't bound a MessageTemplate to the `relance_student` /
 * `relance_parent` action yet. Once a mapping exists, the dialog loads
 * the bound template's subject + body instead of these defaults.
 *
 * The body is markdown rendered through `renderBroadcastMail` at send
 * time — same pipeline as broadcasts. Include greeting + CTA + signature
 * directly (the legacy `buildBrandEmailHtml` shell is gone).
 *
 * Variables follow the unified broadcast-style naming:
 *   student → {{prenom}}, {{nom}}, {{login_link}}
 *   parent  → {{parent_prenom}}, {{parent_nom}}, {{child_prenom}},
 *             {{child_nom}}, {{login_link}}
 */

import type { RelanceType } from '$lib/domain/relance';

export type RelanceTemplate = {
  subject: string;
  body: string;
};

export const STUDENT_RELANCE_DEFAULT: RelanceTemplate = {
  subject: 'Finalise ton inscription sur Jump',
  body: `Salut {{prenom}} !

Ton inscription sur Jump n'est pas encore terminée. Il ne te reste que quelques étapes pour accéder à ton espace.

:button[Finaliser mon inscription]({{login_link}})

À très vite,
L'équipe Epitech Academy`,
};

export const PARENT_RELANCE_DEFAULT: RelanceTemplate = {
  subject: "Rappel : signez le droit à l'image de {{child_prenom}}",
  body: `Bonjour {{parent_prenom}},

Nous n'avons pas encore reçu votre autorisation pour le droit à l'image de **{{child_prenom}}** dans le cadre de son stage Epitech Academy.

Cette signature est nécessaire avant le début du stage et ne prend qu'une minute.

:button[Signer le droit à l'image]({{login_link}})

À très vite,
L'équipe Epitech Academy`,
};

export function defaultRelanceFor(type: RelanceType): RelanceTemplate {
  return type === 'student' ? STUDENT_RELANCE_DEFAULT : PARENT_RELANCE_DEFAULT;
}
