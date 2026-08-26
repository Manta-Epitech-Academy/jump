/**
 * Option polarity: the one place that decides what a good answer is.
 *
 * Worth pinning because nothing stores it. A `scale` carries its meaning in the
 * order it was authored, and two surfaces already read that order as best-to-worst
 * (the respondent renderer's faces and colours, the dev roster's badge). The
 * curated API now computes a favourable share from the same ordering, so a
 * threshold moved here moves a figure a directeur quotes.
 */

import { describe, it, expect } from 'vitest';
import { optionPolarity } from './feedback';

describe('optionPolarity', () => {
  // The stage bilan's shape, and what the dev roster has always shown.
  it('reads a four-option scale as positive, positive, neutral, negative', () => {
    const tiers = [0, 1, 2, 3].map((i) => optionPolarity(i, 4));
    expect(tiers).toEqual(['positive', 'positive', 'neutral', 'negative']);
  });

  it('splits a two-option scale into best and worst', () => {
    expect(optionPolarity(0, 2)).toBe('positive');
    expect(optionPolarity(1, 2)).toBe('negative');
  });

  it('keeps a three-option scale symmetric', () => {
    const tiers = [0, 1, 2].map((i) => optionPolarity(i, 3));
    expect(tiers).toEqual(['positive', 'neutral', 'negative']);
  });

  // A single answer is not a verdict the question offered.
  it('calls a one-option scale neutral rather than positive', () => {
    expect(optionPolarity(0, 1)).toBe('neutral');
  });

  it('never divides by zero on an empty scale', () => {
    expect(optionPolarity(0, 0)).toBe('neutral');
  });
});
