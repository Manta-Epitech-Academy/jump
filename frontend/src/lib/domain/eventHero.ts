import type { EventConfig_HeroStage } from '@prisma/client';

// What one event says on the talent home's blue hero (#501). The PO asked, on
// the call of 13/10/2026, for every stage of the hero to be written per event,
// its button included: a talent is invited to an event, not to one of its
// subjects, and a button label is a marketing choice. So the words belong to
// the event (`EventConfig_Hero`), each field optional, and a field nobody wrote
// shows the 2027 mockup's own words. This module holds the limits the writer
// and the hero share, the defaults, and the one function that resolves them.

/** The stages of an event on the home, in the order a talent lives them. */
export const EVENT_HERO_STAGES = [
  'invitation',
  'enrolled',
  'live',
] as const satisfies readonly EventConfig_HeroStage[];

export type EventHeroStage = (typeof EVENT_HERO_STAGES)[number];

/**
 * The stages that carry a picture: the two before the event, as the mockup
 * draws them. While it runs, the hero heads the subjects, which carry their own
 * (a CHECK on `EventConfig_HeroImage` holds the same rule).
 */
export const HERO_STAGES_WITH_PICTURE = [
  'invitation',
  'enrolled',
] as const satisfies readonly EventHeroStage[];

export function heroStageHasPicture(stage: EventHeroStage): boolean {
  return (HERO_STAGES_WITH_PICTURE as readonly EventHeroStage[]).includes(
    stage,
  );
}

/**
 * The limits that keep the hero's layout, the mockup's own counters: a title
 * on two lines of the display face, a text of a few lines, a button on one.
 * The PO's terms (« tu tailles à la hache, ça peut pas faire plus de tant de
 * caractères ») and the same for every hero text, the campus's generic
 * invitation included.
 */
export const HERO_TITLE_MAX = 60;
export const HERO_TEXT_MAX = 280;
export const HERO_BUTTON_MAX = 24;

/** What an event wrote for one stage, as stored: each field optional. */
export type HeroCopyWritten = {
  title: string | null;
  text: string | null;
  buttonLabel: string | null;
};

/** The words the hero shows at one stage once the defaults are applied. */
export type HeroCopy = {
  /**
   * Null only while the event runs with nothing written: the hero then titles
   * itself with what it offers (the one subject's name, or the choice).
   */
  title: string | null;
  /** Null when the stage has no text to show. */
  text: string | null;
  buttonLabel: string;
};

/**
 * The mockup's words for each stage. Before enrolling, the title is the
 * event's own name and the text says what every Epitech Academy event is;
 * enrolled, the hero says the talent is expected, with the event's name shown
 * beside it (it is the stage's default text, the AC « tiré de l'événement »);
 * while it runs, the subjects title themselves.
 */
export const HERO_DEFAULT_INVITATION_TEXT =
  'Gratuit et ouvert aux débutants : inscris-toi !';
export const HERO_DEFAULT_BUTTON: Record<EventHeroStage, string> = {
  invitation: 'Je m’inscris',
  enrolled: 'Ajouter à mon agenda',
  live: 'Accéder au sujet',
};
export const HERO_DEFAULT_ENROLLED_TITLE = 'On a hâte de te voir';

/** The words one stage of an event's hero shows, written or by default. */
export function heroCopy(
  stage: EventHeroStage,
  written: HeroCopyWritten | null,
  event: { name: string },
): HeroCopy {
  const buttonLabel = written?.buttonLabel ?? HERO_DEFAULT_BUTTON[stage];
  switch (stage) {
    case 'invitation':
      return {
        title: written?.title ?? event.name,
        text: written?.text ?? HERO_DEFAULT_INVITATION_TEXT,
        buttonLabel,
      };
    case 'enrolled':
      return {
        title: written?.title ?? HERO_DEFAULT_ENROLLED_TITLE,
        text: written?.text ?? null,
        buttonLabel,
      };
    case 'live':
      return {
        title: written?.title ?? null,
        text: written?.text ?? null,
        buttonLabel,
      };
  }
}

/**
 * Where an event's hero pictures live once copied, and the URL a page asks for
 * one at. Composed here and nowhere else, because the proxy route turns its two
 * path segments back into the key and the two directions must not drift. A key
 * is minted by the write that copies the picture and names those bytes only,
 * so a new picture is a new URL and the proxy can cache one forever.
 */
const IMAGE_PREFIX = 'event-hero';

export function eventHeroImageKey(
  eventId: string,
  stage: EventHeroStage,
  writeId: string,
  extension: string,
): string {
  return `${IMAGE_PREFIX}/${eventId}/${stage}-${writeId}.${extension}`;
}

/** The key the proxy route's `[eventId]/[file]` segments name. */
export function eventHeroImageKeyFromPath(
  eventId: string,
  file: string,
): string {
  return `${IMAGE_PREFIX}/${eventId}/${file}`;
}

export function eventHeroImageUrl(key: string): string {
  return `/api/event-hero/images/${key.slice(IMAGE_PREFIX.length + 1)}`;
}
