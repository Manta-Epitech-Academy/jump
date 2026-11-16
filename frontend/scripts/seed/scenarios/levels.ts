/**
 * One talent on each Jump level, placed.
 *
 * Mon parcours and the home are drawn from the level a talent has reached: its
 * colour, its badge, its line, the bar to the next one, and « Niveau maximum
 * atteint » at the top. Those are the states the screens are made of, so the
 * seed stands one talent on each level, as it stands one dossier on each rung of
 * the onboarding ladder. Drawing them would not do: production's maximum is
 * 9 190 XP (`PROFILE.md`), so no realistic volume ever reaches Hacker, and the
 * three upper levels would exist in no generated dataset (#446 shipped that way
 * once, and nothing failed).
 *
 * Each talent sits in the middle of its level, so the bar is visibly part-way;
 * the top one a tenth past its threshold, where there is no bar left to fill.
 * The thresholds are read from the domain, never restated, so a level the PO
 * moves moves its talent with it.
 *
 * The XP has to come from a fact the application could have written, and only
 * one source leaves the amount open: a scoreboard reward (`xpAmount: null`),
 * whose per-talent amount the grant script takes as given. So each talent holds
 * its welcome grant and one place on the CTF Shell board, the scoreboard the
 * catalogue has already handed out. Past Maker that place is worth far more
 * than production's largest grant (1 800); that is the over-representation
 * these states need, not a shape anyone should read off.
 *
 * It runs last, so the draws it takes move no talent, event or name of the
 * scenarios before it.
 */

import {
  JUMP_LEVELS,
  WELCOME_XP_BONUS,
  xpRangeForLevel,
  type JumpLevel,
} from '../../../src/lib/domain/xp';
import { addDossier } from '../factories/onboarding';
import { grantReward } from '../factories/engagement';
import type { Scenario } from './types';

/** The scoreboard every placed level is earned on. */
const SCOREBOARD = 'ctf_shell_2026';

/**
 * Where a placed talent stands: half-way through its level, or a tenth past
 * the threshold of the top one, which has no upper bound to be half-way to.
 */
function placedXp(level: JumpLevel): number {
  const { min, maxExclusive } = xpRangeForLevel(level);
  return maxExclusive === null
    ? min + Math.round(min / 10)
    : Math.round((min + maxExclusive) / 2);
}

export const levels: Scenario = {
  name: 'niveaux',
  summary:
    'Un talent sur chaque niveau Jump, d’Explorer à Expert, à mi-chemin du suivant.',
  run(world) {
    const { clock } = world.ctx;
    const campus = [...world.campuses.values()][0]!;
    const placed: { level: JumpLevel; email: string; xp: number }[] = [];

    for (const level of JUMP_LEVELS) {
      const talent = world.addTalent({
        nom: level,
        niveau: 'terminale',
        campus,
        index: world.nextTalentIndex(),
      });
      addDossier(world, {
        talent,
        schoolYear: clock.schoolYear,
        stopAt: null,
        parentCoSigned: true,
        imageRights: 'accepted',
        filedOffset: -60,
      });
      world.grantXp({
        talent,
        source: 'onboarding',
        sourceId: talent.id,
        amount: WELCOME_XP_BONUS,
        at: clock.days(-60),
      });
      const xp = placedXp(level);
      grantReward(world, talent, SCOREBOARD, xp - WELCOME_XP_BONUS);
      placed.push({ level, email: talent.email, xp });
    }

    world.ctx.manifest.push({
      scenario: levels.name,
      summary: levels.summary,
      campus: campus.name,
      covers: [
        'chaque niveau Jump, sa couleur, son badge et sa ligne',
        'la barre à mi-chemin du niveau suivant',
        '« Niveau maximum atteint » au sommet',
      ],
      accounts: placed.map(({ level, email, xp }) => ({
        role: `talent (niveau ${level})`,
        email,
        note: `${xp.toLocaleString('fr-FR')} XP${level === JUMP_LEVELS.at(-1) ? ', niveau maximum atteint' : ''}`,
      })),
    });
  },
};
