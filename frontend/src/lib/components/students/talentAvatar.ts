/**
 * The grounds a talent monogram can land on.
 *
 * Ten of them, and deliberately split between dark grounds with white glyphs and
 * light grounds with dark ones: the mix is what makes a column of two hundred
 * rows read as varied. Five dark grounds did not, which was the fair complaint
 * against the first version of the local avatar.
 *
 * Every pair is measured: `talentAvatar.test.ts` fails if one drops under 4.5:1,
 * so a ground cannot be added on looks alone. All ten come from the charte
 * palette; none is a new colour.
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
  { cls: 'bg-epi-tech-ink text-white', bg: '#007a46', fg: '#ffffff' },
  { cls: 'bg-epi-together-ink text-white', bg: '#b5361a', fg: '#ffffff' },
  { cls: 'bg-epi-tomorrow-ink text-white', bg: '#9b0b93', fg: '#ffffff' },
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
