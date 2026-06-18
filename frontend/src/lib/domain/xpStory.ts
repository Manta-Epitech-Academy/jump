// The per-talent XP "story" for the dev fiche: the total (the hero medallion) plus
// a newest-first history of every XP gain, each humanised (the breakdown dialog).
// Pure + shared (client medallion/dialog + server builder); the server builder
// lives in `server/services/xpStoryService.ts`.
//
// Reconstructed from the XpGrant ledger (facts-as-rows). Tier-free on purpose (no
// Novice/Apprenti/Expert): the dev space surfaces the story, not a ladder.

import { MINIGAME_XP_REWARD } from './xp';

export type XpStory = {
  /** Cached projection total (= SUM of grant amounts = Talent.xp). */
  total: number;
  /** Newest-first feed of every XP gain, for the dialog. */
  history: XpHistoryEntry[];
};

/** One line in the XP history (a single XpGrant, humanised). */
export type XpHistoryEntry = {
  id: string;
  /** Raw XpGrantSource, so the dialog can pick a matching icon. */
  source: string;
  label: string;
  amount: number;
  /** Pre-formatted French date (campus tz), e.g. "16 juin". */
  dateLabel: string;
};

/**
 * Maps a `minigame_rank` grant amount back to the rank tier it rewarded, off the
 * same scale `minigameRankBonus` pays it on: rank 1 = `MINIGAME_XP_REWARD` x2,
 * 2 = x1, 3 = x0.5, and the wider top-N tail = x0.2 ('top', not a podium). Derived
 * from the constant rather than hard-coded amounts so the two can never drift if
 * the base reward is retuned. The exact rank-at-finish is not persisted, so the
 * bonus amount is the only durable signal of how high they placed.
 */
export function podiumTierFromBonus(amount: number): 1 | 2 | 3 | 'top' {
  if (amount >= MINIGAME_XP_REWARD * 2) return 1;
  if (amount >= MINIGAME_XP_REWARD) return 2;
  if (amount >= Math.round(MINIGAME_XP_REWARD / 2)) return 3;
  return 'top';
}

/**
 * Explicit, plain-French label for a single grant in the history feed - the one
 * place that knows how every XP fact is worded, read by both the dev staff fiche
 * and the talent's own `/xp` timeline. Either reader must understand exactly what
 * earned the XP, with no internal jargon and no anglicisms ("early bird" /
 * "onboarding" stay out).
 *
 * Most labels are audience-neutral (descriptive noun phrases, no tu/vous) and the
 * same string serves both. Where the two audiences genuinely want different copy
 * the `audience` param branches *here*, so the divergence stays centralised rather
 * than forking a second label map into a component: the talent reads warmer,
 * gamified wording; the staff reads the most unambiguous phrasing for a fiche.
 *
 * `rewardName` is the `XpReward.name` behind a `reward` grant (resolved
 * server-side via the grant's `sourceId`); it carries the activity identity (e.g.
 * "OSINT CTFD Stage Seconde"), so a reward without it falls back to a generic but
 * still meaningful label rather than the old catch-all "XP gagnés".
 */
export function xpHistoryLabel(
  source: string,
  amount: number,
  rewardName?: string | null,
  audience: 'staff' | 'talent' = 'staff',
): string {
  switch (source) {
    case 'minigame':
      // Talent reads the warm, gamified framing; staff need it unambiguous that a
      // training *game* was finished (not a generic activity) when scanning a fiche.
      return audience === 'talent'
        ? 'Entraînement cérébral'
        : "Jeu d'entraînement terminé";
    case 'minigame_rank': {
      const tier = podiumTierFromBonus(amount);
      if (tier === 1) return '1re place au classement';
      if (tier === 2) return '2e place au classement';
      if (tier === 3) return '3e place au classement';
      return 'Dans le top du classement';
    }
    case 'onboarding':
      return 'Profil complété';
    case 'onboarding_early_bird':
      return 'Inscription parmi les premiers';
    case 'activity_presence':
      return 'Participation à un atelier';
    case 'reward':
      return rewardName?.trim() || 'Activité notée';
    case 'admin_adjustment':
      return amount >= 0
        ? 'Bonus accordé par le staff'
        : 'Ajustement par le staff';
    default:
      return 'XP gagnés';
  }
}
