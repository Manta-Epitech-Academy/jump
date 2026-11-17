import { describe, it, expect } from 'vitest';
import {
  HERO_DEFAULT_BUTTON,
  HERO_DEFAULT_ENROLLED_TITLE,
  HERO_DEFAULT_INVITATION_TEXT,
  eventHeroImageKey,
  eventHeroImageKeyFromPath,
  eventHeroImageUrl,
  HERO_DEFAULT_CHOICE_TITLE,
  HERO_DEFAULT_LIVE_TITLE,
  eventPlace,
  eventVisualAccent,
  heroChoiceText,
  heroCopy,
  heroStageHasPicture,
  liveHeroHeader,
} from './eventHero';

const event = { name: 'Halloween Camp' };

describe('heroCopy', () => {
  // An event nobody wrote for reads exactly as the 2027 mockup draws it.
  it('shows the mockup words for a stage nobody wrote', () => {
    expect(heroCopy('invitation', null, event)).toEqual({
      title: 'Halloween Camp',
      text: HERO_DEFAULT_INVITATION_TEXT,
      buttonLabel: HERO_DEFAULT_BUTTON.invitation,
    });
    expect(heroCopy('enrolled', null)).toEqual({
      title: HERO_DEFAULT_ENROLLED_TITLE,
      text: null,
      buttonLabel: 'Ajouter à mon agenda',
    });
    expect(heroCopy('live', null)).toEqual({
      title: null,
      text: null,
      buttonLabel: 'Accéder au sujet',
    });
  });

  // Each field stands on its own: writing the button keeps the mockup's title.
  it('lays what the event wrote over the defaults, field by field', () => {
    expect(
      heroCopy(
        'invitation',
        {
          title: null,
          text: 'Viens coder des fantômes',
          buttonLabel: 'Je viens',
        },
        event,
      ),
    ).toEqual({
      title: 'Halloween Camp',
      text: 'Viens coder des fantômes',
      buttonLabel: 'Je viens',
    });
    expect(
      heroCopy('live', {
        title: 'Trois sujets au choix',
        text: null,
        buttonLabel: null,
      }),
    ).toEqual({
      title: 'Trois sujets au choix',
      text: null,
      buttonLabel: 'Accéder au sujet',
    });
  });

  it('gives a picture to the stages before the event only', () => {
    expect(heroStageHasPicture('invitation')).toBe(true);
    expect(heroStageHasPicture('enrolled')).toBe(true);
    expect(heroStageHasPicture('live')).toBe(false);
  });
});

describe('event hero picture addresses', () => {
  // The proxy turns its two path segments back into the key: both directions
  // have to agree, or a stored picture would never be served.
  it('turns the URL a page asks for back into the stored key', () => {
    const key = eventHeroImageKey('evt1', 'enrolled', 'w42', 'webp');
    const url = eventHeroImageUrl(key);
    expect(url).toBe('/api/event-hero/images/evt1/enrolled-w42.webp');
    const [eventId, file] = url.split('/').slice(-2);
    expect(eventHeroImageKeyFromPath(eventId!, file!)).toBe(key);
  });
});

describe('liveHeroHeader', () => {
  const subject = (
    label: string,
    slot: 'morning' | 'afternoon' | null = null,
    tagline: string | null = null,
  ) => ({ label, slot, cover: { tagline } });
  const unwritten = { title: null, text: null };

  // The mockup's drawing: one subject titles the hero with its own name and line.
  it('titles the hero with a lone subject when the event wrote nothing', () => {
    expect(
      liveHeroHeader(unwritten, 'Halloween Camp', [
        subject('Pacman Ghost AI', null, 'Programme les fantômes.'),
      ]),
    ).toEqual({
      title: 'Pacman Ghost AI',
      text: 'Programme les fantômes.',
      subjectIsHeader: true,
    });
  });

  // AC2: several subjects at once are a choice, none above the others.
  it('names a choice of several subjects, with the half-day they share', () => {
    expect(
      liveHeroHeader(unwritten, 'Stage de seconde', [
        subject('Pacman', 'morning'),
        subject('Babel Ship', 'morning'),
        subject('Rayban', 'morning'),
      ]),
    ).toEqual({
      title: HERO_DEFAULT_CHOICE_TITLE,
      text: '3 sujets te sont proposés ce matin : commence par celui qui te tente.',
      subjectIsHeader: false,
    });
  });

  it('lets what the event wrote lead, the subjects then coming as cards', () => {
    expect(
      liveHeroHeader(
        { title: 'Bienvenue au camp', text: 'Choisis ton sujet.' },
        'Halloween Camp',
        [subject('Pacman')],
      ),
    ).toEqual({
      title: 'Bienvenue au camp',
      text: 'Choisis ton sujet.',
      subjectIsHeader: false,
    });
  });

  // The day goes on between subjects: the hero still says where the talent is.
  it('stands on the event name when nothing is offered at this moment', () => {
    expect(liveHeroHeader(unwritten, 'Halloween Camp', [])).toEqual({
      title: 'Halloween Camp',
      text: null,
      subjectIsHeader: false,
    });
  });

  // Never the Salesforce title in its place (8de24153).
  it('names the day when the event has no public name', () => {
    expect(liveHeroHeader(unwritten, null, [])).toEqual({
      title: HERO_DEFAULT_LIVE_TITLE,
      text: null,
      subjectIsHeader: false,
    });
  });
});

describe('heroChoiceText', () => {
  it('says « aujourd’hui » unless every subject shares one half-day', () => {
    expect(heroChoiceText(['afternoon', 'afternoon'])).toContain(
      'cet après-midi',
    );
    expect(heroChoiceText(['morning', null])).toContain('aujourd’hui');
    expect(heroChoiceText([null, null])).toContain('aujourd’hui');
  });
});

describe('eventPlace', () => {
  it('places an event at its campus, the only place Jump holds', () => {
    expect(eventPlace('Montpellier')).toBe('Epitech Montpellier');
  });
});

describe('eventVisualAccent', () => {
  // The last line of the visual is display text on the dark ground: 3:1.
  it('keeps a category colour that reads on the dark ground', () => {
    expect(eventVisualAccent('#ff5f3a')).toBe('#ff5f3a');
  });

  it('gives way to the brand neon for a colour too dark, or none', () => {
    expect(eventVisualAccent('#202060')).toBeNull();
    expect(eventVisualAccent(null)).toBeNull();
  });
});
