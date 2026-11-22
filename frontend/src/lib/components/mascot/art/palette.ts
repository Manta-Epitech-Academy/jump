/**
 * EpiDuck's colours, the only place they are written (#539).
 *
 * The duck is an illustration, not interface, so `DESIGN.md` § Mascot exempts
 * it from the token layer the way the logo is: these values are the drawing
 * itself, taken from the sprites the mockup was built with, and a screen never
 * reads one as a role. Where the drawing meets the charte it uses the charte's
 * value (the body is `epiBlue`, the orange crest and scarf `epiTogether`, the
 * pink scarf `epiTomorrow`); the beak's red, the wing's lighter blue, the
 * green scarf and the inks are the character's own, and the deviation is listed
 * in `DESIGN.md`. They do not change with the theme: a duck does not turn
 * another colour at night, and its white outline is what keeps it legible on a
 * dark page.
 */
export const DUCK = {
  body: '#013AFB',
  wing: '#4F7BFF',
  outline: '#FFFFFF',
  eyeWhite: '#FFFFFF',
  pupil: '#0A1F8F',
  beak: '#E52521',
  beakShade: '#B3141A',
  /** Glasses frames and lenses. */
  ink: '#0B0D14',
  lensTint: 'rgba(255,255,255,0.2)',
  crest: '#FF5F3A',
  fringe: '#0A1F8F',
  beanie: '#E52521',
  beanieTrim: '#FFFFFF',
  scarfStripe: 'rgba(255,255,255,0.55)',
  scarf: {
    red: '#E52521',
    green: '#00C774',
    orange: '#FF5F3A',
    pink: '#FF1EF7',
  },
} as const;
