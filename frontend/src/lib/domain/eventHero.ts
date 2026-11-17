import type { EventConfig_HeroStage } from '@prisma/client';
import { contrastRatio, FILL_INKS } from '../design/color';
import type { PresenceSlot } from './eventPresence';

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

/**
 * The words one stage of an event's hero shows, written or by default. Only the
 * invitation titles itself with the event's name by default, so only it takes
 * one: an invitation is always to a named event (`HighlightedEvent`), while an
 * event a talent is enrolled in may have no public name.
 */
export function heroCopy(
  stage: 'invitation',
  written: HeroCopyWritten | null,
  event: { name: string },
): HeroCopy;
export function heroCopy(
  stage: 'enrolled' | 'live',
  written: HeroCopyWritten | null,
): HeroCopy;
export function heroCopy(
  stage: EventHeroStage,
  written: HeroCopyWritten | null,
  event?: { name: string },
): HeroCopy {
  const buttonLabel = written?.buttonLabel ?? HERO_DEFAULT_BUTTON[stage];
  switch (stage) {
    case 'invitation':
      return {
        title: written?.title ?? event?.name ?? null,
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
 * What the hero says while an event runs and it has written nothing: the
 * subjects of the moment are a choice, never a ranking (#501, AC2), so the
 * header names the choice and the subjects come under it as equals. A stage de
 * seconde gives three subjects for a morning: the talent does one or two,
 * whichever they like.
 */
export const HERO_DEFAULT_CHOICE_TITLE = 'À toi de choisir';

/**
 * The title of a running event's hero when it wrote none, offers no subject at
 * this moment, and has no public name to stand in their place.
 */
export const HERO_DEFAULT_LIVE_TITLE = 'C’est le jour J';

/**
 * « 3 sujets te sont proposés ce matin : commence par celui qui te tente. »
 * The moment is the half-day the subjects share; any other mix, a whole day
 * or the whole event, is « aujourd’hui ».
 */
export function heroChoiceText(slots: (PresenceSlot | null)[]): string {
  const moment =
    slots.length > 0 && slots.every((s) => s === 'morning')
      ? 'ce matin'
      : slots.length > 0 && slots.every((s) => s === 'afternoon')
        ? 'cet après-midi'
        : 'aujourd’hui';
  return `${slots.length} sujets te sont proposés ${moment} : commence par celui qui te tente.`;
}

/** What the header of a running event's hero says, and whether a lone
 * subject's own name and line are that header (the mockup's drawing) or come
 * in its card under a header the event wrote. */
export type LiveHeroHeader = {
  title: string;
  text: string | null;
  /** True when the one subject titles the hero, so its card repeats neither. */
  subjectIsHeader: boolean;
};

/**
 * The header of a running event's hero. What the event wrote leads; failing
 * that, one subject titles the hero with its name and line (the mockup), a
 * choice is named as a choice, and with nothing offered at this moment the
 * event's public name stands, or the day itself when it has none.
 */
export function liveHeroHeader(
  copy: Pick<HeroCopy, 'title' | 'text'>,
  eventName: string | null,
  subjects: {
    label: string;
    slot: PresenceSlot | null;
    cover: { tagline: string | null };
  }[],
): LiveHeroHeader {
  if (copy.title !== null) {
    return { title: copy.title, text: copy.text, subjectIsHeader: false };
  }
  if (subjects.length === 1) {
    const [subject] = subjects;
    return {
      title: subject.label,
      text: copy.text ?? subject.cover.tagline,
      subjectIsHeader: true,
    };
  }
  if (subjects.length > 1) {
    return {
      title: HERO_DEFAULT_CHOICE_TITLE,
      text: copy.text ?? heroChoiceText(subjects.map((s) => s.slot)),
      subjectIsHeader: false,
    };
  }
  return {
    title: eventName ?? HERO_DEFAULT_LIVE_TITLE,
    text: copy.text,
    subjectIsHeader: false,
  };
}

/** Where an event takes place, as the hero and the calendar file say it. */
export function eventPlace(campusName: string): string {
  return `Epitech ${campusName}`;
}

/**
 * The colour of the last line of an event's generated visual: its category's,
 * when that reads on the visual's dark ground at display size (3:1), else
 * null so the brand neon takes it. A category colour is the team's choice and
 * outside the palette on purpose (`EventConfig_Category`), so its legibility is
 * the screen's job, never a refusal at write.
 */
export function eventVisualAccent(categoryColor: string | null): string | null {
  if (!categoryColor) return null;
  return contrastRatio(categoryColor, FILL_INKS.dark) >= 3
    ? categoryColor
    : null;
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
