import { toast } from 'svelte-sonner';

// Branded "reward" toast: Epitech-blue fill + soft glow so an XP gain reads as a
// gift, not a system notification. Shared by every talent celebration
// (onboarding arrival, daily minigame) so the styling lives in one place instead
// of being re-inlined at each call site.
const REWARD_TOAST_STYLE =
  'background: var(--color-epi-blue); color: white; border: none; border-radius: 1rem; box-shadow: 0 8px 30px rgb(1 58 251 / 0.2);';

export function rewardToast(
  title: string,
  description: string,
  durationMs = 10000,
) {
  toast(title, {
    description,
    duration: durationMs,
    style: REWARD_TOAST_STYLE,
  });
}

// The daily-minigame win toast fires from two places — right after the win on
// the training page, and as the dashboard fallback when the browser only learns
// of the win on the next visit. Keep the copy here so the two can't drift.
export function minigameRewardToast(xp: number) {
  rewardToast(
    'Défi du jour relevé ! 🎮',
    `Tu gagnes +${xp} XP pour avoir terminé ton entraînement du jour. Reviens demain pour un nouveau défi !`,
  );
}
