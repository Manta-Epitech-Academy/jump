import type { InterviewRecommendation } from '@prisma/client';

/**
 * Talent badges — mock catalogue.
 *
 * Predicate-based, computed on demand from data already in `+page.server.ts`.
 * No persistence: the `Talent.badges` JSON column stays unused for now.
 * The catalogue is intentionally playful — staff see them on the talent
 * profile and the descriptions are short ribs about what a talent has earned.
 */

export type BadgeColor =
  | 'epi-blue'
  | 'epi-teal'
  | 'epi-orange'
  | 'epi-pink'
  | 'epi-black';

export type BadgeIcon =
  | 'zap'
  | 'medal'
  | 'trophy'
  | 'file-signature'
  | 'compass'
  | 'image'
  | 'palette'
  | 'hammer';

export type BadgeCtx = {
  xp: number;
  eventsCount: number;
  interestCount: number;
  charterAcceptedAt: Date | null;
  recommendation: InterviewRecommendation | null;
  presenceRatio: number;
  fullStageAttendance: boolean;
  portfolioCount: number;
  distinctThemeCount: number;
};

export type Badge = {
  id: string;
  label: string;
  description: string;
  icon: BadgeIcon;
  color: BadgeColor;
  predicate: (c: BadgeCtx) => boolean;
};

export type BadgeView = Omit<Badge, 'predicate'> & { earned: boolean };

export const BADGES: Badge[] = [
  {
    id: 'multi-laser',
    label: 'Multi-Laser',
    description: "Cinq centres d'intérêt cochés. Touche-à-tout assumé.",
    icon: 'zap',
    color: 'epi-teal',
    predicate: (c) => c.interestCount >= 5,
  },
  {
    id: 'marathonien',
    label: 'Marathonien',
    description:
      "Aucune absence sur un stage complet. Le siège n'a jamais été vide.",
    icon: 'medal',
    color: 'epi-orange',
    predicate: (c) => c.fullStageAttendance,
  },
  {
    id: 'cumulard',
    label: 'Le Cumulard',
    description: '500 XP au compteur, pas que des miettes.',
    icon: 'trophy',
    color: 'epi-orange',
    predicate: (c) => c.xp >= 500,
  },
  {
    id: 'signataire',
    label: 'Signataire-Né',
    description: 'Charte signée du premier coup, sans relance. On respire.',
    icon: 'file-signature',
    color: 'epi-blue',
    predicate: (c) => c.charterAcceptedAt != null,
  },
  {
    id: 'boussole',
    label: 'Boussole Calibrée',
    description: "Recommandation d'orientation posée. Le cap est mis.",
    icon: 'compass',
    color: 'epi-pink',
    predicate: (c) =>
      c.recommendation === 'epitech_orientation_forte' ||
      c.recommendation === 'autre_filiere',
  },
  {
    id: 'oeuvre-au-noir',
    label: 'Œuvre au Noir',
    description: "Premier livrable déposé. La toile n'est plus blanche.",
    icon: 'image',
    color: 'epi-black',
    predicate: (c) => c.portfolioCount >= 1,
  },
  {
    id: 'kaleidoscope',
    label: 'Kaléidoscope',
    description:
      'Trois thèmes différents touchés. Profil dispersé, dans le bon sens.',
    icon: 'palette',
    color: 'epi-teal',
    predicate: (c) => c.distinctThemeCount >= 3,
  },
  {
    id: 'premiere-pierre',
    label: 'Première Pierre',
    description:
      'Profil créé, charte signée, lycée renseigné. Les fondations tiennent.',
    icon: 'hammer',
    color: 'epi-blue',
    predicate: (c) => c.charterAcceptedAt != null && c.interestCount >= 1,
  },
];

export function computeBadges(ctx: BadgeCtx): BadgeView[] {
  return BADGES.map(({ predicate, ...meta }) => ({
    ...meta,
    earned: predicate(ctx),
  }));
}

type BuildCtxInput = {
  talent: {
    xp: number;
    eventsCount: number;
    charterAcceptedAt: Date | null;
    interests: { interest: { id: string } }[];
  };
  participations: {
    isPresent: boolean;
    delay: number | null;
    event: { eventType: string };
    activities: { activity: { activityThemes: { theme: { id: string } }[] } }[];
  }[];
  portfolioItems: { id: string }[];
  interviews: {
    status: string;
    recommendation: InterviewRecommendation | null;
  }[];
};

export function buildBadgeCtx(input: BuildCtxInput): BadgeCtx {
  const total = input.participations.length;
  const present = input.participations.filter((p) => p.isPresent).length;
  const presenceRatio = total === 0 ? 0 : present / total;

  // Full attendance: any stage_seconde participation marked present without a
  // recorded delay. v1 — refined when day-by-day attendance lands in schema.
  const fullStageAttendance = input.participations.some(
    (p) =>
      p.event.eventType === 'stage_seconde' &&
      p.isPresent &&
      (p.delay ?? 0) === 0,
  );

  const themeIds = new Set<string>();
  for (const p of input.participations) {
    if (!p.isPresent) continue;
    for (const pa of p.activities) {
      for (const at of pa.activity.activityThemes) {
        themeIds.add(at.theme.id);
      }
    }
  }

  // Surface the most recent completed-interview recommendation. Matches the
  // logic used in the hero / interview-reco card so badges and chip agree.
  const latestRecommendation =
    input.interviews.find(
      (iv) => iv.status === 'completed' && iv.recommendation,
    )?.recommendation ?? null;

  return {
    xp: input.talent.xp,
    eventsCount: input.talent.eventsCount,
    interestCount: input.talent.interests.length,
    charterAcceptedAt: input.talent.charterAcceptedAt,
    recommendation: latestRecommendation,
    presenceRatio,
    fullStageAttendance,
    portfolioCount: input.portfolioItems.length,
    distinctThemeCount: themeIds.size,
  };
}
