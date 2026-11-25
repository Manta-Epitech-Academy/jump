/**
 * What the first three campuses put on their talents' home: « le mot du
 * campus », their generic invitation, and the event one of them puts forward.
 *
 * Placed, never drawn, and on the three campuses every profile has, so each
 * state the home has to render exists even in CI:
 *
 *   - Paris writes a note, a generic invitation with an animated picture
 *     (stored with its still), and points at an upcoming camp of its own
 *     (`HIGHLIGHTED_EVENT`, created by `campusHome`, which has the events): a
 *     talent there who is not enrolled in it is invited to it, the generic
 *     invitation waiting behind. The pictures are keys without bytes, since the
 *     generator stores the bytes of the activities' pictures only
 *     (`storage.ts`), so the hero's fallback is what shows;
 *   - Marseille writes a note and still points at an open day that has since
 *     taken place (`PAST_HIGHLIGHTED_EVENT`): the home no longer shows it and
 *     `config_talent_home` says why;
 *   - Lyon writes a generic invitation only, the shape every campus actually
 *     put forward in November 2026 (« toute l'année »), with its own button
 *     label and a still picture, the case of a picture with no still of its own.
 *
 * The sign-up links point at `.invalid` (RFC 2606), for the reason
 * `catalog/workshops.ts` gives: a validation environment must not send anybody
 * to a live form.
 */

/** A campus's generic invitation, as `write_talent_home_highlight` stores it. */
export type InvitationSpec = {
  readonly title: string;
  readonly text: string;
  readonly url: string;
  /** Null for the mockup's « Je m'inscris ». */
  readonly buttonLabel: string | null;
  /** Its picture as copied, or null for an invitation without one. */
  readonly image: {
    readonly width: number;
    readonly height: number;
    /** An animated GIF, stored with its first frame as a still. */
    readonly animated: boolean;
  } | null;
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
    '![Un mercredi de Coding Club à Paris](https://assets.seed.invalid/talent-home/paris-club.png)',
    '',
    'Rejoins la communauté sur [le Discord du campus](https://discord.invalid/epitech-paris) pour ne rater aucune date.',
    '',
    '![Le Snake de la dernière séance](https://assets.seed.invalid/talent-home/paris-snake.gif)',
    '',
    'Une question ? [Écris-nous](mailto:paris@epitech.invalid).',
  ].join('\n'),
  Marseille: [
    'Bienvenue sur ton espace ! Les prochaines dates des Coding Clubs arrivent très vite : en attendant, entraîne ton cerveau chaque jour, directement depuis ton accueil.',
  ].join('\n'),
};

/**
 * The copies of the pictures each note names, by the address the note writes,
 * as the write would have stored them: a portrait still and an animation, so a
 * generated home shows both shapes the card has to lay out. No bytes stand
 * behind the keys, which the card's broken-picture handling hides.
 */
export const TALENT_HOME_NOTE_IMAGES: Readonly<
  Record<
    string,
    readonly {
      readonly sourceUrl: string;
      readonly width: number;
      readonly height: number;
      readonly animated: boolean;
    }[]
  >
> = {
  Paris: [
    {
      sourceUrl: 'https://assets.seed.invalid/talent-home/paris-club.png',
      width: 1080,
      height: 1350,
      animated: false,
    },
    {
      sourceUrl: 'https://assets.seed.invalid/talent-home/paris-snake.gif',
      width: 480,
      height: 270,
      animated: true,
    },
  ],
};

export const TALENT_HOME_INVITATIONS: Readonly<Record<string, InvitationSpec>> =
  {
    Paris: {
      title: 'Les Ateliers TECH',
      text: 'Toute l’année, Epitech Paris organise des ateliers gratuits : IA, code, robotique, cybersécurité. Pour y participer, rien de plus simple : inscris-toi !',
      url: 'https://www.epitech.invalid/agenda-paris',
      buttonLabel: null,
      image: { width: 1280, height: 720, animated: true },
    },
    Lyon: {
      title: 'Les ateliers de la tech',
      text: 'Toute l’année, Epitech organise des ateliers gratuits : IA, code, robotique, cybersécurité. Pour y participer, inscris-toi !',
      url: 'https://www.epitech.invalid/agenda',
      buttonLabel: 'Voir l’agenda',
      image: { width: 1080, height: 1350, animated: false },
    },
  };

/**
 * The event a campus points at: a camp of its own a little after the anchor,
 * with its sign-up form, invited to until the end of its first day.
 */
export const HIGHLIGHTED_EVENT = {
  campus: 'Paris',
  dayOffset: 9,
  days: 4,
  publicName: 'Halloween Camp',
  signupUrl:
    'https://www.epitech.invalid/inscription-camp/?CampaignId=sd-halloween',
} as const;

/**
 * An event a campus pointed at while it was still to come, and which has since
 * started: the pointer stays until somebody rewrites it, and shows nothing.
 */
export const PAST_HIGHLIGHTED_EVENT = {
  campus: 'Marseille',
  dayOffset: -4,
  days: 1,
  publicName: 'Journée portes ouvertes',
  signupUrl:
    'https://www.epitech.invalid/journees-portes-ouvertes/?CampaignId=sd-jpo',
} as const;

/**
 * The campuses whose home leads a talent's hero with something it puts
 * forward on the anchor day: every campus with an invitation (it never
 * retires). Its hero leads with it for every talent of the campus with no
 * activity and no enrolment that day.
 */
export const OPEN_HIGHLIGHT_CAMPUSES: ReadonlySet<string> = new Set([
  ...Object.keys(TALENT_HOME_INVITATIONS),
  HIGHLIGHTED_EVENT.campus,
]);
