/**
 * EpiDuck's colours (#539), as the interface reads them.
 *
 * They are written once, in `palette.json` beside this file, because two
 * programs read them: `frontend/scripts/epiduck/build.py`, which paints the
 * duck with them when it renders him, and the settings card, whose scarf
 * swatches show the scarf's base colour. Each material has three tones, the
 * shade, the base and the light of his cel shading.
 *
 * The duck is an illustration, not interface, so `DESIGN.md` § Mascot exempts
 * it from the token layer the way the logo is: no screen reads one of these
 * values as a role. Where the drawing meets the charte it uses the charte's
 * value (the body is `epiBlue`, the orange crest and scarf `epiTogether`, the
 * pink scarf `epiTomorrow`); the beak's red, the wing's lighter blue, the green
 * scarf and the inks are the character's own, and the deviation is listed in
 * `DESIGN.md`. They do not change with the theme: a duck does not turn another
 * colour at night, and his white outline is what keeps him legible on a dark
 * page.
 */
import palette from './palette.json';

export const DUCK = palette;
