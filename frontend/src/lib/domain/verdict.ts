import type {
  ParticipationVerdict,
  ParticipationContextTag,
} from '@prisma/client';

export const VERDICT_VALUES = [
  'comfortable',
  'progressing',
  'struggling',
] as const satisfies readonly ParticipationVerdict[];

export const CONTEXT_TAG_VALUES = [
  'helped_others',
  'disengaged',
] as const satisfies readonly ParticipationContextTag[];

export const VERDICT_LABELS: Record<ParticipationVerdict, string> = {
  comfortable: 'À l’aise',
  progressing: 'En progression',
  struggling: 'En difficulté',
};

export const VERDICT_EMOJIS: Record<ParticipationVerdict, string> = {
  comfortable: '🚀',
  progressing: '🌱',
  struggling: '🆘',
};

export const CONTEXT_TAG_LABELS: Record<ParticipationContextTag, string> = {
  helped_others: 'A aidé les autres',
  disengaged: 'Peu engagé',
};

export const CONTEXT_TAG_EMOJIS: Record<ParticipationContextTag, string> = {
  helped_others: '🤝',
  disengaged: '💤',
};

export function isVerdict(value: unknown): value is ParticipationVerdict {
  return (
    typeof value === 'string' &&
    (VERDICT_VALUES as readonly string[]).includes(value)
  );
}

export function isContextTag(value: unknown): value is ParticipationContextTag {
  return (
    typeof value === 'string' &&
    (CONTEXT_TAG_VALUES as readonly string[]).includes(value)
  );
}

export type VerdictHistogram = Record<ParticipationVerdict, number>;

export function emptyVerdictHistogram(): VerdictHistogram {
  return { comfortable: 0, progressing: 0, struggling: 0 };
}

export function tallyVerdicts(
  verdicts: readonly (ParticipationVerdict | null | undefined)[],
): VerdictHistogram {
  const histogram = emptyVerdictHistogram();
  for (const v of verdicts) {
    if (v) histogram[v] += 1;
  }
  return histogram;
}
