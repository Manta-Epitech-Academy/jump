// The per-talent XP "story" for the dev fiche: a glance summary (total + a couple
// of engagement counts for the hero medallion) plus a newest-first history of
// every XP gain, each humanised. Pure + shared (client medallion/dialog + server
// builder); the server builder lives in `server/services/xpStoryService.ts`.
//
// Reconstructed from the XpGrant ledger (facts-as-rows). Tier-free on purpose (no
// Novice/Apprenti/Expert): the dev space surfaces the story, not a ladder.

export type XpStory = {
  /** Cached projection total (= SUM of grant amounts = Talent.xp). */
  total: number;
  /** Mini-jeux played, for the hero medallion's at-a-glance count. */
  minigamePlays: number;
  /** Times in the top of a daily leaderboard, for the hero medallion. */
  podiumCount: number;
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
 * Maps a `minigame_rank` grant amount back to the rank tier it rewarded. Mirrors
 * `minigameRankBonus` in `domain/xp.ts` (rank 1 -> 100, 2 -> 50, 3 -> 25,
 * 4..limit -> 10). The exact rank-at-finish is not persisted, so the bonus amount
 * is the only durable signal of how high they placed.
 */
export function podiumTierFromBonus(amount: number): 1 | 2 | 3 | 'top' {
  if (amount >= 100) return 1;
  if (amount >= 50) return 2;
  if (amount >= 25) return 3;
  return 'top';
}

/**
 * Explicit, plain-French label for a single grant in the history feed - the staff
 * reading the fiche should understand exactly what earned the XP, with no internal
 * jargon and no ambiguity.
 */
export function xpHistoryLabel(source: string, amount: number): string {
  switch (source) {
    case 'minigame':
      return "Jeu d'entraînement du jour terminé";
    case 'minigame_rank': {
      const tier = podiumTierFromBonus(amount);
      if (tier === 1) return '1re place au classement du jour';
      if (tier === 2) return '2e place au classement du jour';
      if (tier === 3) return '3e place au classement du jour';
      return 'Dans le top du classement du jour';
    }
    case 'onboarding':
      return 'Profil complété';
    case 'onboarding_early_bird':
      return 'Inscription parmi les premiers';
    case 'activity_presence':
      return 'Participation à un atelier';
    case 'admin_adjustment':
      return amount >= 0
        ? 'Bonus accordé par le staff'
        : 'Ajustement par le staff';
    default:
      return 'XP gagnés';
  }
}
