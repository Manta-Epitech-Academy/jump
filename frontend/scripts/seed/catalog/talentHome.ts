/**
 * What every campus puts on its talents' home: « le mot du campus », the
 * standing invitation, and, on some, an event it points at.
 *
 * Production keeps a standing invitation on every campus all year (« Les
 * Ateliers TECH », the link to the campus's own agenda), and most campuses
 * point at an upcoming event of their own on top of it. So the hero is never
 * empty for a talent who belongs to a campus, and the dataset holds the same
 * shape on every campus of every profile (#547):
 *
 *   - every campus writes a note and keeps the standing invitation, with its
 *     picture (`invitationFor`, `noteFor`). A campus that points at nothing
 *     falls back to it, and so does one whose event has passed, which is what
 *     a dataset opened weeks after its anchor shows;
 *   - Paris writes its own note and invitation, with an animated picture
 *     (stored with its still), and points at an upcoming camp of its own
 *     (`HIGHLIGHTED_EVENT`, created by `campusHome`, which has the events);
 *   - Marseille still points at an open day that has since taken place
 *     (`PAST_HIGHLIGHTED_EVENT`): the home no longer shows it, its invitation
 *     leads instead, and `config_talent_home` says why;
 *   - Lyon points at nothing (`UNPOINTED_CAMPUS`), the campus that has planned
 *     nothing yet, and words its invitation its own way, with its own button
 *     label and a portrait picture;
 *   - every other campus points at the next event it can invite to: the one
 *     an earlier scenario placed there (the club's next session, on its
 *     campus), or else its next Coding Club (`NEXT_CLUB`), the shape most
 *     campuses carry through the year.
 *
 * The pictures are keys without bytes, since the generator stores the bytes
 * of the activities' pictures only (`storage.ts`), so the hero's fallback is
 * what shows. The links point at `.invalid` (RFC 2606), for the reason
 * `catalog/workshops.ts` gives: a validation environment must not send anybody
 * to a live form.
 */

import { slug } from '../ids';

/** A campus's generic invitation, as `write_talent_home_highlight` stores it. */
export type InvitationSpec = {
  readonly title: string;
  readonly text: string;
  readonly url: string;
  /** Null for the mockup's « Je m'inscris ». */
  readonly buttonLabel: string | null;
  /** Its picture as copied. */
  readonly image: {
    /** The address it was copied from, as `config_talent_home` hands it back. */
    readonly sourceUrl: string;
    readonly width: number;
    readonly height: number;
    /** An animated GIF, stored with its first frame as a still. */
    readonly animated: boolean;
  };
};

/** The campus as a link writes it: `La Réunion` is `la-reunion`. */
function urlSlug(campusName: string): string {
  return slug(campusName).replace(/_/g, '-');
}

/** The note a campus writes when it has nothing of its own to say. */
const STANDING_NOTE = [
  '## La référence de la tech depuis 1999',
  '',
  'Depuis plus de 25 ans, Epitech forme les experts du numérique grâce à une pédagogie par projets : on apprend en construisant, en équipe. [Lire l’article](https://www.epitech.invalid/classement-2026)',
].join('\n');

const OWN_NOTES: Readonly<Record<string, string>> = {
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
};

/** « Le mot du campus », every campus's: its own words, or the standing note. */
export function noteFor(campusName: string): string {
  return OWN_NOTES[campusName] ?? STANDING_NOTE;
}

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

const OWN_INVITATIONS: Readonly<Record<string, InvitationSpec>> = {
  Paris: {
    title: 'Les Ateliers TECH',
    text: 'Toute l’année, Epitech Paris organise des ateliers gratuits : IA, code, robotique, cybersécurité. Pour y participer, rien de plus simple : inscris-toi !',
    url: 'https://www.epitech.invalid/agenda-paris',
    buttonLabel: null,
    image: {
      sourceUrl: 'https://assets.seed.invalid/talent-home/paris.gif',
      width: 1280,
      height: 720,
      animated: true,
    },
  },
  Lyon: {
    title: 'Les ateliers de la tech',
    text: 'Toute l’année, Epitech organise des ateliers gratuits : IA, code, robotique, cybersécurité. Pour y participer, inscris-toi !',
    url: 'https://www.epitech.invalid/agenda-lyon',
    buttonLabel: 'Voir l’agenda',
    image: {
      sourceUrl: 'https://assets.seed.invalid/talent-home/lyon.png',
      width: 1080,
      height: 1350,
      animated: false,
    },
  },
};

/**
 * Every campus's standing invitation: its own words, or production's, which
 * every campus carried in November 2026 with a link to its own agenda and one
 * shared picture.
 */
export function invitationFor(campusName: string): InvitationSpec {
  return (
    OWN_INVITATIONS[campusName] ?? {
      title: 'Les Ateliers TECH',
      text: 'Toute l’année, Epitech organise des ateliers GRATUITS : IA, code, robotique, cybersécurité. Pour y participer, rien de plus simple : inscris-toi !',
      url: `https://www.epitech.invalid/agenda-${urlSlug(campusName)}`,
      buttonLabel: null,
      image: {
        sourceUrl: 'https://assets.seed.invalid/talent-home/ateliers-tech.jpg',
        width: 1280,
        height: 720,
        animated: false,
      },
    }
  );
}

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
 * started: the pointer stays until somebody rewrites it, and shows nothing, so
 * the campus's standing invitation leads its hero.
 */
export const PAST_HIGHLIGHTED_EVENT = {
  campus: 'Marseille',
  dayOffset: -4,
  days: 1,
  publicName: 'Journée portes ouvertes',
  signupUrl:
    'https://www.epitech.invalid/journees-portes-ouvertes/?CampaignId=sd-jpo',
} as const;

/** The campus that points at nothing: its talents see its invitation alone. */
export const UNPOINTED_CAMPUS = 'Lyon';

/**
 * What every other campus points at when no scenario placed an event it can
 * invite to: its next Coding Club, a session of its own a week or two after
 * the anchor, with its sign-up form. The day moves by one per campus, so the
 * campuses do not all meet on the same date.
 */
export const NEXT_CLUB = {
  firstOffset: 6,
  spread: 8,
  startMinutes: 14 * 60,
} as const;

export function nextClubSignupUrl(campusName: string): string {
  return `https://www.epitech.invalid/inscription-coding-club/?CampaignId=sd-club-${urlSlug(campusName)}`;
}
