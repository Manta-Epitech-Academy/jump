import { toast } from 'svelte-sonner';

// Branded "reward" toast: Epitech-blue fill + soft glow so an XP gain reads as a
// gift, not a system notification. Shared by every talent celebration
// (onboarding arrival, daily minigame) so the styling lives in one place instead
// of being re-inlined at each call site.
const REWARD_TOAST_STYLE =
  'background: var(--color-epi-blue); color: white; border: none; border-radius: 1rem; box-shadow: 0 8px 30px rgb(1 58 251 / 0.2);';

// 6s dwell: long enough to read a motivating line, short enough not to read as
// stuck. The old 12s looked infinite; svelte-sonner's 4s default is too brief to
// land an XP-incentive message before it vanishes.
const REWARD_TOAST_DURATION_MS = 6000;

// The arrival toast carries two sentences (recognition + the XP lesson), so it
// needs longer on screen than the one-line minigame toasts. A real student
// reported the 6s default vanished before they finished reading it.
const WELCOME_TOAST_DURATION_MS = 7000;

export function rewardToast(
  title: string,
  description: string,
  durationMs: number = REWARD_TOAST_DURATION_MS,
) {
  toast(title, {
    description,
    duration: durationMs,
    style: REWARD_TOAST_STYLE,
  });
}

// The XP system's core lesson, shared by both arrival branches so an early-bird
// finisher learns it too: XP tracks progression and grows by participating. It
// used to live only on the normal branch, so the fastest finishers got the
// pioneer praise but missed the explanation of what XP is even for.
const XP_PROGRESSION_HINT =
  'Les XP reflètent ta progression, tu en gagneras en participant aux activités !';

// Onboarding arrival reward, fired on the first dashboard load after onboarding. The
// early-bird branch layers pioneer recognition + the bonus breakdown ON TOP of
// the same progression hint the normal branch shows, rather than replacing it,
// so being among the first of your campus never costs you the lesson.
export function welcomeRewardToast(totalXp: number, earlyBirdBonus: number) {
  const body =
    earlyBirdBonus > 0
      ? `Tu fais partie des premiers de ton campus : +${totalXp} XP de bienvenue (+${earlyBirdBonus} de bonus rapidité). ${XP_PROGRESSION_HINT}`
      : `Tu gagnes +${totalXp} XP pour ton arrivée. ${XP_PROGRESSION_HINT}`;
  rewardToast('Bienvenue sur Jump ! 🎉', body, WELCOME_TOAST_DURATION_MS);
}

// The daily-minigame win toast fires from two places — right after the win on
// the training page, and as the dashboard fallback when the browser only learns
// of the win on the next visit. Keep the copy here so the two can't drift.
export function minigameRewardToast(xp: number) {
  rewardToast(
    'Défi du jour relevé ! 🎮',
    `Tu gagnes +${xp} XP pour ton entraînement du jour. Reviens demain pour un nouveau défi !`,
  );
}

// The rank bonus is granted at finish based on the talent's place on the campus
// board; the play page floats only the base finish reward, so this float fires on
// the next dashboard visit. The reward pool reaches past the podium to the top of
// the campus, so the copy stays placement-neutral (the board shows the exact
// rank). No replay nudge: a talent plays each daily challenge once (eligibility
// blocks a second go), so the board can't be re-climbed: the forward pull is the
// next day's challenge, which the base finish toast already carries.
export function minigameRankRewardToast(xp: number) {
  rewardToast(
    'Dans le top du campus ! 🏆',
    `Tu gagnes +${xp} XP bonus pour ton classement parmi les meilleurs de ton campus.`,
  );
}
