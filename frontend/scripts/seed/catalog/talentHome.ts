/**
 * What the first three campuses put on their talents' home: « le mot du
 * campus » and the event they invite talents to sign up for.
 *
 * Placed, never drawn, and on the three campuses every profile has, so each
 * state the home has to render exists even in CI:
 *
 *   - Paris writes both, the highlight with a picture, so a talent there sees
 *     the note in Actualités and the invitation leading the home's hero on a
 *     day without an activity (the picture is a key without bytes, like every
 *     stored file the generator writes, so the hero's fallback is what shows);
 *   - Marseille writes only a note, so a talent there with an activity left
 *     unfinished sees the hero suggest carrying it on at home;
 *   - Lyon put forward an event whose day has passed, which the home must no
 *     longer show and `config_talent_home` must report as no longer shown.
 *
 * The sign-up links point at `.invalid` (RFC 2606), for the reason
 * `catalog/workshops.ts` gives: a validation environment must not send anybody
 * to a live form.
 */

export type HighlightSpec = {
  readonly title: string;
  readonly summary: string;
  /** Days from the anchor. Negative is an event already past. */
  readonly dayOffset: number;
  readonly url: string;
  /** Its picture as copied, or null for a highlight without one. */
  readonly image: { readonly width: number; readonly height: number } | null;
};

export const TALENT_HOME_NOTES: Readonly<Record<string, string>> = {
  Paris: [
    '## Bonne rentrée avec Epitech Paris !',
    '',
    'Les Coding Clubs reprennent un mercredi sur trois. Au programme ce trimestre :',
    '',
    '- **Recode le jeu Snake** en JavaScript',
    '- Ton premier site web, de la page blanche à la mise en ligne',
    '- Une IA qui joue à Pac-Man à ta place',
    '',
    'Rejoins la communauté sur [le Discord du campus](https://discord.invalid/epitech-paris) pour ne rater aucune date.',
    '',
    'Une question ? [Écris-nous](mailto:paris@epitech.invalid).',
  ].join('\n'),
  Marseille: [
    'Bienvenue sur ton espace ! Les prochaines dates des Coding Clubs arrivent très vite : en attendant, entraîne ton cerveau chaque jour, directement depuis ton accueil.',
  ].join('\n'),
};

export const TALENT_HOME_HIGHLIGHTS: Readonly<Record<string, HighlightSpec>> = {
  Paris: {
    title: 'Recode le jeu Snake en JS',
    summary:
      'Deux heures pour coder ton propre Snake avec des étudiants Epitech, sans rien avoir installé avant. Viens avec un ami, on fournit les ordinateurs.',
    dayOffset: 9,
    url: 'https://www.epitech.invalid/inscription-atelier-programmation-informatique/?CampaignId=sd-snake',
    image: { width: 1280, height: 720 },
  },
  Lyon: {
    title: 'Journée portes ouvertes',
    summary:
      'Visite le campus, rencontre les étudiants et découvre les projets de première année.',
    dayOffset: -4,
    url: 'https://www.epitech.invalid/journees-portes-ouvertes/?CampaignId=sd-jpo',
    image: null,
  },
};
