/**
 * The grounds a talent monogram can land on.
 *
 * Seven, and deliberately split between dark grounds with a white glyph and
 * light grounds with a dark one: the mix is what makes a column of two hundred
 * rows read as varied, more than the count does.
 *
 * **None of them is an ink token, on purpose.** An ink value is a text colour,
 * and `.on-dark` swaps it for the raw neon so text stays legible on a dark
 * surface. Used as a FILL that swap inverts the meaning: the avatar on the
 * talent fiche hero turned neon-adjacent with white initials on it. Every ground
 * here is a colour that means the same thing in both themes.
 *
 * Every pair is measured in `talentAvatar.test.ts`, so a ground cannot be added
 * on looks alone.
 */
export type AvatarGround = {
  /** Tailwind classes for the ground and its glyph. */
  readonly cls: string;
  /** The resolved pair, for the contrast test. */
  readonly bg: string;
  readonly fg: string;
};

export const AVATAR_GROUNDS: readonly AvatarGround[] = [
  { cls: 'bg-epi-blue text-white', bg: '#013afb', fg: '#ffffff' },
  { cls: 'bg-epi-dark text-white', bg: '#181818', fg: '#ffffff' },
  { cls: 'bg-chrome text-white', bg: '#0b0e1a', fg: '#ffffff' },
  { cls: 'bg-epi-tech text-epi-dark', bg: '#00ff97', fg: '#181818' },
  { cls: 'bg-epi-together text-epi-dark', bg: '#ff5f3a', fg: '#181818' },
  { cls: 'bg-epi-tomorrow text-epi-dark', bg: '#ff1ef7', fg: '#181818' },
  { cls: 'bg-epi-lavender text-epi-dark', bg: '#b8c0e8', fg: '#181818' },
];

/**
 * Stable ground for a talent. Seeded on the id and not on the name, so the
 * avatar keeps its identity when a name is corrected, and so two talents who
 * share initials do not share a colour.
 */
export function talentGround(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_GROUNDS[Math.abs(hash) % AVATAR_GROUNDS.length].cls;
}
