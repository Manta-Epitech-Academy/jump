import { describe, it, expect } from 'vitest';
import {
  HERO_DEFAULT_BUTTON,
  HERO_DEFAULT_ENROLLED_TITLE,
  HERO_DEFAULT_INVITATION_TEXT,
  eventHeroImageKey,
  eventHeroImageKeyFromPath,
  eventHeroImageUrl,
  heroCopy,
  heroStageHasPicture,
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
    expect(heroCopy('enrolled', null, event)).toEqual({
      title: HERO_DEFAULT_ENROLLED_TITLE,
      text: null,
      buttonLabel: 'Ajouter à mon agenda',
    });
    expect(heroCopy('live', null, event)).toEqual({
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
      heroCopy(
        'live',
        { title: 'À toi de jouer', text: null, buttonLabel: null },
        event,
      ),
    ).toEqual({
      title: 'À toi de jouer',
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
